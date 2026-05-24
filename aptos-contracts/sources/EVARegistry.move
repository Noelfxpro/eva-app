module eva_registry::registry {
    use std::signer;
    use aptos_framework::event;
    use aptos_framework::timestamp;

    #[event]
    struct HashAnchored has drop, store {
        hash: vector<u8>,
        author: address,
        timestamp_us: u64,
    }

    /// Anchor a post hash on-chain. The transaction itself is the proof:
    /// the signer's address, the hash, and the block timestamp are immutable.
    public entry fun anchor_hash(account: &signer, hash: vector<u8>) {
        event::emit(HashAnchored {
            hash,
            author: signer::address_of(account),
            timestamp_us: timestamp::now_microseconds(),
        });
    }
}
