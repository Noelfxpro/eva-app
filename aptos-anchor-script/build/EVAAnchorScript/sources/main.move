script {
    // Anchor a post hash on the Aptos blockchain.
    // The `hash` argument is stored permanently in the transaction payload.
    // Anyone can verify by fetching the transaction and inspecting arguments[0].
    fun main(_account: &signer, _hash: vector<u8>) {}
}
