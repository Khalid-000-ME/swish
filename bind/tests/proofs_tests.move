/// Proves the crypto path end-to-end: a signature produced *off-chain*
/// (see lib/attest.ts `canonicalAttestMessage`) against a fixed, known
/// declaration id verifies successfully against the *on-chain*
/// `canonical_message` reconstruction in proofs.move — i.e. the two
/// implementations agree byte-for-byte. Vector regenerated with:
///
///   node -e "const ed=require('@noble/ed25519'),c=require('crypto');
///   (async()=>{const id=c.createHash('sha256').update('bind:test-declaration-id').digest();
///   const dg=c.createHash('sha256').update('bind:test-effects-digest').digest();
///   const msg=c.createHash('sha256').update(Buffer.concat([id,dg,Buffer.alloc(0),Buffer.alloc(8)])).digest();
///   const sk=ed.utils.randomSecretKey();const pk=await ed.getPublicKeyAsync(sk);
///   const sig=await ed.signAsync(msg,sk);console.log(id.toString('hex'),dg.toString('hex'),
///   Buffer.from(pk).toString('hex'),Buffer.from(sig).toString('hex'));})()"
#[test_only]
module bind::proofs_tests;

use sui::test_scenario;
use bind::proofs;

const ADMIN: address = @0xA11CE;

const DECL_ID_ADDR: address = @0x03a7b0991d6e7f388dbea1cf2908560c23a0443fa76fee043c284225c15f0317;
const EFFECTS_DIGEST: vector<u8> = x"916b8cdde38beb02496da5564de8c421f46fede30d253930011c2031e92dc738";
const PUBKEY: vector<u8> = x"10dde213533864715ba34428ea0f581cbfc5328fa3d4931eaaa7940c0b87b8e7";
const SIG: vector<u8> = x"eb4802fd00d723ed619e3274c4cb5545b3f030811a647686a729e3a45e79b12462cf2218b841a1aa07f4aa8342e3b4ef2adb1d5a7e10d34186f7b914daed9f09";

#[test]
fun off_chain_signature_verifies_on_chain() {
    let mut scenario = test_scenario::begin(ADMIN);
    {
        proofs::init_for_testing(test_scenario::ctx(&mut scenario));
    };
    test_scenario::next_tx(&mut scenario, ADMIN);
    {
        let mut reg = test_scenario::take_shared<proofs::AttestorRegistry>(&scenario);
        proofs::set_attestor_pubkey(&mut reg, PUBKEY, test_scenario::ctx(&mut scenario));

        let declaration_id = object::id_from_address(DECL_ID_ADDR);
        let proof = proofs::mint_match_proof(
            &reg, declaration_id, EFFECTS_DIGEST, SIG, test_scenario::ctx(&mut scenario),
        );
        assert!(proofs::match_declaration_id(&proof) == declaration_id, 0);
        std::unit_test::destroy(proof);
        test_scenario::return_shared(reg);
    };
    test_scenario::end(scenario);
}

#[test]
#[expected_failure(abort_code = 200, location = bind::proofs)] // E_BAD_SIG
fun wrong_declaration_id_fails_signature_check() {
    // Same signature, different declaration_id argument: proves the id is
    // bound *into* the signed bytes, not trusted as a free-standing param —
    // this is the exact gap "Whisper Attacks" names for AP2.
    let mut scenario = test_scenario::begin(ADMIN);
    {
        proofs::init_for_testing(test_scenario::ctx(&mut scenario));
    };
    test_scenario::next_tx(&mut scenario, ADMIN);
    {
        let mut reg = test_scenario::take_shared<proofs::AttestorRegistry>(&scenario);
        proofs::set_attestor_pubkey(&mut reg, PUBKEY, test_scenario::ctx(&mut scenario));

        let wrong_id = object::id_from_address(@0xBAD);
        let proof = proofs::mint_match_proof(
            &reg, wrong_id, EFFECTS_DIGEST, SIG, test_scenario::ctx(&mut scenario),
        );
        std::unit_test::destroy(proof);
        test_scenario::return_shared(reg);
    };
    test_scenario::end(scenario);
}
