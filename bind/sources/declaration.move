/// A typed, on-chain claim of intent: "this vault, this recipient, this
/// asset, at most this amount, expiring at this time, for this reason."
/// BIND_PRD.md §6.2. Minted only by the backend's AgentCap — the agent
/// itself never holds a key that can write to the chain.
module bind::declaration;

use bind::agent_cap::AgentCap;

const E_ZERO_AMOUNT: u64 = 100;

public struct Declaration has key, store {
    id: UID,
    vault_id: ID,
    recipient: address,
    coin_type: vector<u8>,
    max_amount: u64,
    expires_ms: u64,
    reason_hash: vector<u8>,
    nonce: u64,
}

public struct DeclarationMade has copy, drop {
    declaration_id: ID,
    vault_id: ID,
    recipient: address,
    max_amount: u64,
    expires_ms: u64,
}

public fun mint(
    _cap: &AgentCap,
    vault_id: ID,
    recipient: address,
    coin_type: vector<u8>,
    max_amount: u64,
    expires_ms: u64,
    reason_hash: vector<u8>,
    nonce: u64,
    ctx: &mut TxContext,
): Declaration {
    assert!(max_amount > 0, E_ZERO_AMOUNT);
    let id = object::new(ctx);
    let declaration_id = object::uid_to_inner(&id);
    sui::event::emit(DeclarationMade { declaration_id, vault_id, recipient, max_amount, expires_ms });
    Declaration { id, vault_id, recipient, coin_type, max_amount, expires_ms, reason_hash, nonce }
}

public fun id(d: &Declaration): ID { object::uid_to_inner(&d.id) }
public fun vault_id(d: &Declaration): ID { d.vault_id }
public fun recipient(d: &Declaration): address { d.recipient }
public fun max_amount(d: &Declaration): u64 { d.max_amount }
public fun expires_ms(d: &Declaration): u64 { d.expires_ms }
public fun nonce(d: &Declaration): u64 { d.nonce }

/// Package-visibility consumption: the only way a Declaration ever stops
/// existing is by being destructured here, inside a vault execution call.
public(package) fun consume(d: Declaration): (ID, ID, address, u64, u64, vector<u8>) {
    let Declaration { id, vault_id, recipient, coin_type: _, max_amount, expires_ms, reason_hash, nonce: _ } = d;
    let declaration_id = object::uid_to_inner(&id);
    object::delete(id);
    (declaration_id, vault_id, recipient, max_amount, expires_ms, reason_hash)
}
