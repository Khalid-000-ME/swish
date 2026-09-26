/// MatchProof and OverrideApproval: the only two objects that can ever
/// unlock a vault's balance (BIND_PRD.md §6.3). Both are minted only
/// against a valid ed25519 signature from the registered attestation key,
/// verified on-chain — so a proof existing here is never just the
/// backend's say-so, it's independently checkable by the chain itself.
module bind::proofs;

use sui::ed25519;

const E_BAD_SIG: u64 = 200;
const E_NOT_ADMIN: u64 = 201;

public struct AttestorRegistry has key {
    id: UID,
    pubkey: vector<u8>,
    admin: address,
}

public struct MatchProof has key, store {
    id: UID,
    declaration_id: ID,
    effects_digest: vector<u8>,
}

public struct OverrideApproval has key, store {
    id: UID,
    declaration_id: ID,
    effects_digest: vector<u8>,
    nullifier_hash: vector<u8>,
    verified_at_ms: u64,
}

public struct ProofMinted has copy, drop {
    declaration_id: ID,
    via_override: bool,
}

fun init(ctx: &mut TxContext) {
    let registry = AttestorRegistry {
        id: object::new(ctx),
        pubkey: vector[],
        admin: tx_context::sender(ctx),
    };
    transfer::share_object(registry);
}

public fun set_attestor_pubkey(reg: &mut AttestorRegistry, pubkey: vector<u8>, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == reg.admin, E_NOT_ADMIN);
    reg.pubkey = pubkey;
}

/// Reconstructed on-chain, never trusted as an opaque caller-supplied
/// blob — this is what binds the signature to *this* declaration_id
/// rather than letting a valid signature over some other message be
/// replayed against a mismatched declaration_id argument. Mirrors
/// `canonicalAttestMessage` in lib/attest.ts byte-for-byte.
fun canonical_message(
    declaration_id: ID,
    effects_digest: vector<u8>,
    nullifier_hash: vector<u8>,
    verified_at_ms: u64,
): vector<u8> {
    let mut buf = object::id_to_bytes(&declaration_id);
    vector::append(&mut buf, effects_digest);
    vector::append(&mut buf, nullifier_hash);
    vector::append(&mut buf, std::bcs::to_bytes(&verified_at_ms));
    std::hash::sha2_256(buf)
}

public fun mint_match_proof(
    reg: &AttestorRegistry,
    declaration_id: ID,
    effects_digest: vector<u8>,
    sig: vector<u8>,
    ctx: &mut TxContext,
): MatchProof {
    let msg = canonical_message(declaration_id, effects_digest, vector[], 0);
    assert!(ed25519::ed25519_verify(&sig, &reg.pubkey, &msg), E_BAD_SIG);
    sui::event::emit(ProofMinted { declaration_id, via_override: false });
    MatchProof { id: object::new(ctx), declaration_id, effects_digest }
}

public fun mint_override_approval(
    reg: &AttestorRegistry,
    declaration_id: ID,
    effects_digest: vector<u8>,
    nullifier_hash: vector<u8>,
    verified_at_ms: u64,
    sig: vector<u8>,
    ctx: &mut TxContext,
): OverrideApproval {
    let msg = canonical_message(declaration_id, effects_digest, nullifier_hash, verified_at_ms);
    assert!(ed25519::ed25519_verify(&sig, &reg.pubkey, &msg), E_BAD_SIG);
    sui::event::emit(ProofMinted { declaration_id, via_override: true });
    OverrideApproval { id: object::new(ctx), declaration_id, effects_digest, nullifier_hash, verified_at_ms }
}

public fun match_declaration_id(p: &MatchProof): ID { p.declaration_id }
public fun override_declaration_id(a: &OverrideApproval): ID { a.declaration_id }

public(package) fun consume_match(p: MatchProof): (ID, vector<u8>) {
    let MatchProof { id, declaration_id, effects_digest } = p;
    object::delete(id);
    (declaration_id, effects_digest)
}

public(package) fun consume_override(a: OverrideApproval): (ID, vector<u8>, vector<u8>) {
    let OverrideApproval { id, declaration_id, effects_digest, nullifier_hash, verified_at_ms: _ } = a;
    object::delete(id);
    (declaration_id, effects_digest, nullifier_hash)
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }

#[test_only]
public fun canonical_message_for_testing(
    declaration_id: ID, effects_digest: vector<u8>, nullifier_hash: vector<u8>, verified_at_ms: u64,
): vector<u8> {
    canonical_message(declaration_id, effects_digest, nullifier_hash, verified_at_ms)
}

/// Test-only bypass: mints proof objects without a real signature, so
/// vault-logic tests (allowlist/caps/expiry/frozen/proof-mismatch) can
/// drive `execute_declared`/`execute_with_override` without needing a
/// signature over a not-yet-known, runtime-generated declaration id.
/// Stripped from production bytecode — the real `ed25519_verify` path in
/// `mint_match_proof` / `mint_override_approval` above is exercised
/// separately, against a fixed known id, in proofs_tests.move.
#[test_only]
public fun mint_match_proof_for_testing(declaration_id: ID, effects_digest: vector<u8>, ctx: &mut TxContext): MatchProof {
    MatchProof { id: object::new(ctx), declaration_id, effects_digest }
}

#[test_only]
public fun mint_override_approval_for_testing(
    declaration_id: ID, effects_digest: vector<u8>, nullifier_hash: vector<u8>, verified_at_ms: u64, ctx: &mut TxContext,
): OverrideApproval {
    OverrideApproval { id: object::new(ctx), declaration_id, effects_digest, nullifier_hash, verified_at_ms }
}
