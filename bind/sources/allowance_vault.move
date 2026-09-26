/// The only place spending authority exists. BIND_PRD.md §6.1.
///
/// Two functions let an *agent's* money move: `execute_declared` and
/// `execute_with_override`. Both take a Declaration and a proof object as
/// arguments and *destroy both on the way in* — so there is no boolean
/// flag to forget to check and no path that survives a future refactor,
/// which is the exact failure that let the Grok/Bankr wallet get drained
/// twice (BIND_PRD.md §2).
///
/// `grep -n "balance::split"` finds three call sites. Two are those, and
/// the third is `owner_withdraw`, which asserts the caller is `owner` and
/// touches no agent machinery at all. The guarantee this module makes has
/// always been about what an agent can do without a declaration — it was
/// never that the person who funded a vault can't get their money back.
/// Stating it as "two call sites" was the cleaner sentence and the less
/// accurate one.
module bind::allowance_vault;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::clock::{Self, Clock};
use sui::vec_set::{Self, VecSet};

use bind::declaration::{Self, Declaration};
use bind::proofs::{Self, MatchProof, OverrideApproval};

const E_NOT_OWNER: u64 = 1;
const E_WRONG_VAULT: u64 = 2;
const E_OVER_TX_CAP: u64 = 3;
const E_OVER_WINDOW_CAP: u64 = 4;
const E_DECLARATION_EXPIRED: u64 = 5;
const E_NOT_ALLOWLISTED: u64 = 8;
const E_VAULT_FROZEN: u64 = 9;
const E_PROOF_MISMATCH: u64 = 10;
const E_INSUFFICIENT_BALANCE: u64 = 11;

/// Authority is read only from these fields, mutable only by `owner`.
/// This is what makes the Bankr-style attack — an unsolicited object
/// silently unlocking a higher permission tier — structurally inert here:
/// a *received* object cannot reach `set_allowlist_add` or `set_caps`,
/// because those functions assert the caller is `owner`, not "whoever
/// sent us something."
public struct Vault<phantom T> has key {
    id: UID,
    balance: Balance<T>,
    owner: address,
    agent: address,
    allowlist: VecSet<address>,
    per_tx_cap: u64,
    window_ms: u64,
    window_start_ms: u64,
    window_spent: u64,
    frozen: bool,
}

public struct VaultCreated has copy, drop { vault_id: ID, owner: address, agent: address }
public struct Executed has copy, drop {
    vault_id: ID,
    declaration_id: ID,
    recipient: address,
    amount: u64,
    via_override: bool,
}
public struct VaultFrozenEvent has copy, drop { vault_id: ID }
public struct OwnerWithdrew has copy, drop { vault_id: ID, recipient: address, amount: u64 }

public fun create_vault<T>(
    agent: address,
    per_tx_cap: u64,
    window_ms: u64,
    initial: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Vault<T> {
    let owner = tx_context::sender(ctx);
    let id = object::new(ctx);
    let vault_id = object::uid_to_inner(&id);
    sui::event::emit(VaultCreated { vault_id, owner, agent });
    Vault {
        id,
        balance: coin::into_balance(initial),
        owner,
        agent,
        allowlist: vec_set::empty(),
        per_tx_cap,
        window_ms,
        window_start_ms: clock::timestamp_ms(clock),
        window_spent: 0,
        frozen: false,
    }
}

public fun share<T>(v: Vault<T>) {
    transfer::share_object(v);
}

public fun set_allowlist_add<T>(v: &mut Vault<T>, addr: address, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == v.owner, E_NOT_OWNER);
    if (!vec_set::contains(&v.allowlist, &addr)) {
        vec_set::insert(&mut v.allowlist, addr);
    }
}

public fun set_allowlist_remove<T>(v: &mut Vault<T>, addr: address, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == v.owner, E_NOT_OWNER);
    if (vec_set::contains(&v.allowlist, &addr)) {
        vec_set::remove(&mut v.allowlist, &addr);
    }
}

public fun set_caps<T>(v: &mut Vault<T>, per_tx_cap: u64, window_ms: u64, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == v.owner, E_NOT_OWNER);
    v.per_tx_cap = per_tx_cap;
    v.window_ms = window_ms;
}

/// Owner-only kill switch. Independent of everything else in this module.
public fun freeze_vault<T>(v: &mut Vault<T>, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == v.owner, E_NOT_OWNER);
    v.frozen = true;
    sui::event::emit(VaultFrozenEvent { vault_id: object::uid_to_inner(&v.id) });
}

public fun unfreeze_vault<T>(v: &mut Vault<T>, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == v.owner, E_NOT_OWNER);
    v.frozen = false;
}

/// Anyone may top up a vault — deposits need no authority.
public fun deposit<T>(v: &mut Vault<T>, c: Coin<T>) {
    balance::join(&mut v.balance, coin::into_balance(c));
}

/// Owner-only withdrawal, to any address — including the agent's own, so
/// an operator can hand their agent gas money out of the budget they
/// already set aside for it.
///
/// A vault is a budget, not a trap. Without this, money could go in and
/// only ever leave through a declared, allow-listed, capped payment, which
/// means an owner who mis-set an allow-list had no way to retrieve their
/// own funds. That's a bug, not a guarantee.
///
/// Deliberately not routed through `per_tx_cap` or the window. Those bound
/// the *agent*, and the owner can already rewrite both with `set_caps` —
/// running the owner through limits they can lift in the same transaction
/// would only make this look more constrained than it is.
///
/// Withdrawal works while frozen on purpose: `freeze_vault` exists to stop
/// an agent mid-incident, and getting your money out is the first thing
/// you'd want to do next.
public fun owner_withdraw<T>(
    v: &mut Vault<T>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert!(tx_context::sender(ctx) == v.owner, E_NOT_OWNER);
    assert!(balance::value(&v.balance) >= amount, E_INSUFFICIENT_BALANCE);

    let out = coin::from_balance(balance::split(&mut v.balance, amount), ctx);
    transfer::public_transfer(out, recipient);
    sui::event::emit(OwnerWithdrew {
        vault_id: object::uid_to_inner(&v.id),
        recipient,
        amount,
    });
}

fun roll_window<T>(v: &mut Vault<T>, clock: &Clock) {
    let now = clock::timestamp_ms(clock);
    if (now >= v.window_start_ms + v.window_ms) {
        v.window_start_ms = now;
        v.window_spent = 0;
    }
}

/// Demo-simple rolling ceiling: five per-tx caps per window.
fun window_cap<T>(v: &Vault<T>): u64 {
    v.per_tx_cap * 5
}

/// AUTO PATH — the clean-diff case. Consumes a Declaration and a
/// MatchProof; both cease to exist the instant this call runs.
public fun execute_declared<T>(
    v: &mut Vault<T>,
    decl: Declaration,
    proof: MatchProof,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!v.frozen, E_VAULT_FROZEN);
    let vault_id = object::uid_to_inner(&v.id);

    let (declaration_id, d_vault, d_recipient, d_max, d_expires, _reason_hash) =
        declaration::consume(decl);
    let (p_decl_id, _effects_digest) = proofs::consume_match(proof);

    assert!(p_decl_id == declaration_id, E_PROOF_MISMATCH);
    assert!(d_vault == vault_id, E_WRONG_VAULT);
    assert!(clock::timestamp_ms(clock) <= d_expires, E_DECLARATION_EXPIRED);
    assert!(vec_set::contains(&v.allowlist, &d_recipient), E_NOT_ALLOWLISTED);
    assert!(d_max <= v.per_tx_cap, E_OVER_TX_CAP);

    roll_window(v, clock);
    assert!(v.window_spent + d_max <= window_cap(v), E_OVER_WINDOW_CAP);
    v.window_spent = v.window_spent + d_max;

    let out = coin::from_balance(balance::split(&mut v.balance, d_max), ctx);
    transfer::public_transfer(out, d_recipient);
    sui::event::emit(Executed { vault_id, declaration_id, recipient: d_recipient, amount: d_max, via_override: false });
}

/// OVERRIDE PATH — identical enforcement, minus the allow-list check,
/// because a fresh World-ID-verified human looked at this exact recipient.
public fun execute_with_override<T>(
    v: &mut Vault<T>,
    decl: Declaration,
    approval: OverrideApproval,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!v.frozen, E_VAULT_FROZEN);
    let vault_id = object::uid_to_inner(&v.id);

    let (declaration_id, d_vault, d_recipient, d_max, d_expires, _reason_hash) =
        declaration::consume(decl);
    let (a_decl_id, _effects_digest, _nullifier) = proofs::consume_override(approval);

    assert!(a_decl_id == declaration_id, E_PROOF_MISMATCH);
    assert!(d_vault == vault_id, E_WRONG_VAULT);
    assert!(clock::timestamp_ms(clock) <= d_expires, E_DECLARATION_EXPIRED);
    assert!(d_max <= v.per_tx_cap, E_OVER_TX_CAP);

    roll_window(v, clock);
    assert!(v.window_spent + d_max <= window_cap(v), E_OVER_WINDOW_CAP);
    v.window_spent = v.window_spent + d_max;

    let out = coin::from_balance(balance::split(&mut v.balance, d_max), ctx);
    transfer::public_transfer(out, d_recipient);
    sui::event::emit(Executed { vault_id, declaration_id, recipient: d_recipient, amount: d_max, via_override: true });
}

// ---- read-only views ----------------------------------------------------

public fun balance_value<T>(v: &Vault<T>): u64 { balance::value(&v.balance) }
public fun owner<T>(v: &Vault<T>): address { v.owner }
public fun agent<T>(v: &Vault<T>): address { v.agent }
public fun is_allowlisted<T>(v: &Vault<T>, addr: address): bool { vec_set::contains(&v.allowlist, &addr) }
public fun per_tx_cap<T>(v: &Vault<T>): u64 { v.per_tx_cap }
public fun window_spent<T>(v: &Vault<T>): u64 { v.window_spent }
public fun is_frozen<T>(v: &Vault<T>): bool { v.frozen }
public fun vault_id<T>(v: &Vault<T>): ID { object::uid_to_inner(&v.id) }
