/// Vault-level invariants, negative case first per BIND_PRD.md's own build
/// order: "write this test before the happy path." Proof objects here use
/// the `#[test_only]` bypass constructors (see proofs.move) so these tests
/// isolate the vault's own enforcement logic from the separately-tested
/// signature path (proofs_tests.move).
#[test_only]
module bind::negative_paths;

use sui::test_scenario;
use sui::coin;
use sui::clock;
use sui::sui::SUI;

use bind::allowance_vault as vault;
use bind::declaration;
use bind::proofs;
use bind::agent_cap::{Self, AgentCap};

const OWNER: address = @0xB0B0;
const AGENT: address = @0xA6E7;
const MERCHANT: address = @0x7E1C;
const OUTSIDER: address = @0x0FF;
const NOT_OWNER: address = @0xEE55;

const ONE_SUI: u64 = 1_000_000_000;

/// Shared setup: owner creates a vault with 10 SUI, allow-lists MERCHANT,
/// caps per-tx at 2 SUI, and mints an AgentCap for declaring intents.
fun setup(scenario: &mut test_scenario::Scenario): (vault::Vault<SUI>, AgentCap, clock::Clock) {
    let ctx = test_scenario::ctx(scenario);
    let coin = coin::mint_for_testing<SUI>(10 * ONE_SUI, ctx);
    let clock = clock::create_for_testing(ctx);
    let mut v = vault::create_vault<SUI>(AGENT, 2 * ONE_SUI, 60_000, coin, &clock, ctx);
    vault::set_allowlist_add(&mut v, MERCHANT, ctx);

    agent_cap::init_for_testing(ctx);
    test_scenario::next_tx(scenario, OWNER);
    let cap = test_scenario::take_from_sender<AgentCap>(scenario);
    (v, cap, clock)
}

fun teardown(v: vault::Vault<SUI>, cap: AgentCap, clock: clock::Clock) {
    std::unit_test::destroy(v);
    std::unit_test::destroy(cap);
    clock::destroy_for_testing(clock);
}

#[test]
fun happy_path_executes() {
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, clock) = setup(&mut scenario);
    let ctx = test_scenario::ctx(&mut scenario);

    let vault_id = vault::vault_id(&v);
    let decl = declaration::mint(&cap, vault_id, MERCHANT, b"0x2::sui::SUI", ONE_SUI, 999_999_999_999, b"", 0, ctx);
    let proof = proofs::mint_match_proof_for_testing(declaration::id(&decl), b"digest", ctx);

    vault::execute_declared(&mut v, decl, proof, &clock, ctx);
    assert!(vault::balance_value(&v) == 9 * ONE_SUI, 0);

    teardown(v, cap, clock);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = 8, location = bind::allowance_vault)] // E_NOT_ALLOWLISTED
fun blocks_undeclared_beneficiary() {
    // The Bybit-class case at the vault layer: a recipient the declaration
    // never named (i.e. never allow-listed) cannot receive funds through
    // the auto path, full stop.
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, clock) = setup(&mut scenario);
    let ctx = test_scenario::ctx(&mut scenario);

    let vault_id = vault::vault_id(&v);
    let decl = declaration::mint(&cap, vault_id, OUTSIDER, b"0x2::sui::SUI", ONE_SUI, 999_999_999_999, b"", 0, ctx);
    let proof = proofs::mint_match_proof_for_testing(declaration::id(&decl), b"digest", ctx);

    vault::execute_declared(&mut v, decl, proof, &clock, ctx);
    teardown(v, cap, clock);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = 3, location = bind::allowance_vault)] // E_OVER_TX_CAP
fun blocks_amount_over_cap() {
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, clock) = setup(&mut scenario);
    let ctx = test_scenario::ctx(&mut scenario);

    let vault_id = vault::vault_id(&v);
    // 5 SUI declared against a 2 SUI per-tx cap.
    let decl = declaration::mint(&cap, vault_id, MERCHANT, b"0x2::sui::SUI", 5 * ONE_SUI, 999_999_999_999, b"", 0, ctx);
    let proof = proofs::mint_match_proof_for_testing(declaration::id(&decl), b"digest", ctx);

    vault::execute_declared(&mut v, decl, proof, &clock, ctx);
    teardown(v, cap, clock);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = 5, location = bind::allowance_vault)] // E_DECLARATION_EXPIRED
fun blocks_expired_declaration() {
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, mut clock) = setup(&mut scenario);
    let ctx = test_scenario::ctx(&mut scenario);

    let vault_id = vault::vault_id(&v);
    let decl = declaration::mint(&cap, vault_id, MERCHANT, b"0x2::sui::SUI", ONE_SUI, 0, b"", 0, ctx); // expires at t=0
    clock::increment_for_testing(&mut clock, 1); // now t=1 > expires_ms=0
    let proof = proofs::mint_match_proof_for_testing(declaration::id(&decl), b"digest", ctx);

    vault::execute_declared(&mut v, decl, proof, &clock, ctx);
    teardown(v, cap, clock);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = 9, location = bind::allowance_vault)] // E_VAULT_FROZEN
fun blocks_when_frozen() {
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, clock) = setup(&mut scenario);
    let ctx = test_scenario::ctx(&mut scenario);

    vault::freeze_vault(&mut v, ctx);

    let vault_id = vault::vault_id(&v);
    let decl = declaration::mint(&cap, vault_id, MERCHANT, b"0x2::sui::SUI", ONE_SUI, 999_999_999_999, b"", 0, ctx);
    let proof = proofs::mint_match_proof_for_testing(declaration::id(&decl), b"digest", ctx);

    vault::execute_declared(&mut v, decl, proof, &clock, ctx);
    teardown(v, cap, clock);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = 10, location = bind::allowance_vault)] // E_PROOF_MISMATCH
fun blocks_proof_for_a_different_declaration() {
    // A MatchProof minted against one declaration cannot unlock a
    // different one — proves the objects are bound to each other, not
    // just independently "valid-looking".
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, clock) = setup(&mut scenario);
    let ctx = test_scenario::ctx(&mut scenario);

    let vault_id = vault::vault_id(&v);
    let decl_a = declaration::mint(&cap, vault_id, MERCHANT, b"0x2::sui::SUI", ONE_SUI, 999_999_999_999, b"", 0, ctx);
    let decl_b = declaration::mint(&cap, vault_id, MERCHANT, b"0x2::sui::SUI", ONE_SUI, 999_999_999_999, b"", 1, ctx);
    let proof_for_b = proofs::mint_match_proof_for_testing(declaration::id(&decl_b), b"digest", ctx);

    vault::execute_declared(&mut v, decl_a, proof_for_b, &clock, ctx); // wrong pairing
    std::unit_test::destroy(decl_b);
    teardown(v, cap, clock);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = 1, location = bind::allowance_vault)] // E_NOT_OWNER
fun non_owner_cannot_change_allowlist() {
    // The Bankr-class case at the vault layer: authority is read only from
    // Vault.owner. Nothing an outsider (or a received object) does can
    // touch the allow-list or caps.
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, clock) = setup(&mut scenario);
    test_scenario::next_tx(&mut scenario, NOT_OWNER);
    let ctx = test_scenario::ctx(&mut scenario);

    vault::set_allowlist_add(&mut v, OUTSIDER, ctx);
    teardown(v, cap, clock);
    test_scenario::end(scenario);
}

#[test]
fun override_path_allows_novel_recipient() {
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, clock) = setup(&mut scenario);
    let ctx = test_scenario::ctx(&mut scenario);

    let vault_id = vault::vault_id(&v);
    // OUTSIDER is not allow-listed — the override path is the only door.
    let decl = declaration::mint(&cap, vault_id, OUTSIDER, b"0x2::sui::SUI", ONE_SUI, 999_999_999_999, b"", 0, ctx);
    let approval = proofs::mint_override_approval_for_testing(declaration::id(&decl), b"digest", b"nullifier", 0, ctx);

    vault::execute_with_override(&mut v, decl, approval, &clock, ctx);
    assert!(vault::balance_value(&v) == 9 * ONE_SUI, 0);

    teardown(v, cap, clock);
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = 4, location = bind::allowance_vault)] // E_OVER_WINDOW_CAP
fun blocks_rolling_window_exceeded() {
    let mut scenario = test_scenario::begin(OWNER);
    let (mut v, cap, clock) = setup(&mut scenario);
    let ctx = test_scenario::ctx(&mut scenario);
    let vault_id = vault::vault_id(&v);

    // window cap = per_tx_cap * 5 = 10 SUI; six 2-SUI payments should trip it.
    let mut i = 0;
    while (i < 6) {
        let decl = declaration::mint(&cap, vault_id, MERCHANT, b"0x2::sui::SUI", 2 * ONE_SUI, 999_999_999_999, b"", i, ctx);
        let proof = proofs::mint_match_proof_for_testing(declaration::id(&decl), b"digest", ctx);
        vault::execute_declared(&mut v, decl, proof, &clock, ctx);
        i = i + 1;
    };

    teardown(v, cap, clock);
    test_scenario::end(scenario);
}
