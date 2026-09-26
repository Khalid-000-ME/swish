/// The backend's minting authority. Per BIND_PRD.md §6.2: "AgentCap is held
/// by the backend, not the LLM. The LLM's output is translated into a
/// declaration by deterministic code; the model never signs."
module bind::agent_cap;

public struct AgentCap has key, store {
    id: UID,
}

public struct AgentCapIssued has copy, drop {
    cap_id: ID,
    to: address,
}

/// The publisher receives the first AgentCap.
fun init(ctx: &mut TxContext) {
    let cap = AgentCap { id: object::new(ctx) };
    let cap_id = object::uid_to_inner(&cap.id);
    let to = tx_context::sender(ctx);
    transfer::transfer(cap, to);
    sui::event::emit(AgentCapIssued { cap_id, to });
}

/// Rotate/delegate minting authority. Kept simple for the demo; a real
/// deployment would gate this behind a DAO or multisig instead of letting
/// any holder reissue at will.
public fun issue(_cap: &AgentCap, to: address, ctx: &mut TxContext) {
    let new_cap = AgentCap { id: object::new(ctx) };
    let cap_id = object::uid_to_inner(&new_cap.id);
    transfer::transfer(new_cap, to);
    sui::event::emit(AgentCapIssued { cap_id, to });
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
