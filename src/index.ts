import dotenv from 'dotenv';
import { loadKZG } from 'kzg-wasm';
import {
  ByteArray,
  bytesToHex,
  createWalletClient,
  hexToBytes,
  http,
  parseGwei,
  stringToHex,
  toBlobs,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

dotenv.config({ quiet: true });

if (!process.env.PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY is not set');
}

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

async function signRawTransaction() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });

  /**
   * Note: if you'd prefer to use `c-kzg` instead of `kzg-wasm`, you'll need the following:
   *
   * import * as cKzg from "c-kzg";
   * import { setupKzg } from "viem";
   *
   * // This file has been included in this example folder already; it's more reliable than using the one exported by Viem
   * const mainnetTrustedSetupPath = resolve("./src/eip4844/trusted-setups.json");
   *
   * const kzg = setupKzg(cKzg, mainnetTrustedSetupPath);
   *
   * ...
   *
   * // `kzg` can then be used in requests such as `await client.prepareTransactionRequest({
   *   ...
   *   kzg,
   *   ...
   * });
   */
  const kzg = await loadKZG();
  const blobs = toBlobs({ data: stringToHex('hello world') });

  // These adaptations are required in order to use `kzg-wasm`, in order for types to resolve.
  // Why `kzg-wasm` over `c-kzg`? No particular reason, but makes builds simpler in certain environments.
  const blobToKzgCommitmentAdapter = (blob: ByteArray): ByteArray => {
    const hexInput = bytesToHex(blob);
    const commitmentHex = kzg.blobToKZGCommitment(hexInput);
    return hexToBytes(commitmentHex as `0x${string}`);
  };

  const computeBlobKzgProofAdapter = (
    blob: ByteArray,
    commitment: ByteArray
  ): ByteArray => {
    const hexBlob = bytesToHex(blob);
    const hexCommitment = bytesToHex(commitment);
    const proofHex = kzg.computeBlobKZGProof(hexBlob, hexCommitment);
    return hexToBytes(proofHex as `0x${string}`);
  };

  const adaptedKzg = {
    ...kzg,
    computeBlobKzgProof: computeBlobKzgProofAdapter,
    blobToKzgCommitment: blobToKzgCommitmentAdapter,
  };

  // Prepare the transaction first
  const request = await client.prepareTransactionRequest({
    account: account,
    blobs,
    kzg: adaptedKzg,
    maxFeePerBlobGas: parseGwei('30'),
    to: '0x0000000000000000000000000000000000000000',
    type: 'eip4844',
  });

  const signableTransaction = {
    ...request,
    sidecars: false as false, // see: https://github.com/wevm/viem/blob/73a677c1f5138ac343bfe8b869f39829c7d6eeba/src/accounts/utils/signTransaction.ts#L53-L62
  };

  // Sign the transaction
  const serializedTx = await account.signTransaction(signableTransaction);

  const txHash = await client.sendRawTransaction({
    serializedTransaction: serializedTx,
  });

  console.log(`Transaction sent: https://sepolia.etherscan.io/tx/${txHash}`);
}

async function signTransaction() {
  const account = privateKeyToAccount(PRIVATE_KEY);

  const client = createWalletClient({
    account: account,
    chain: sepolia,
    transport: http(),
  });

  /**
   * Note: if you'd prefer to use `c-kzg` instead of `kzg-wasm`, you'll need the following:
   *
   * import * as cKzg from "c-kzg";
   * import { setupKzg } from "viem";
   *
   * // This file has been included in this example folder already; it's more reliable than using the one exported by Viem
   * const mainnetTrustedSetupPath = resolve("./src/eip4844/trusted-setups.json");
   *
   * const kzg = setupKzg(cKzg, mainnetTrustedSetupPath);
   *
   * ...
   *
   * // `kzg` can then be used in requests such as `await client.sendTransaction({
   *   ...
   *   kzg,
   *   ...
   * });
   */
  const kzg = await loadKZG();
  const blobs = toBlobs({ data: stringToHex('hello world') });

  // These adaptations are required in order to use `kzg-wasm`, in order for types to resolve.
  // Why `kzg-wasm` over `c-kzg`? No particular reason, but makes builds simpler in certain environments.
  const blobToKzgCommitmentAdapter = (blob: ByteArray): ByteArray => {
    const hexInput = bytesToHex(blob);
    const commitmentHex = kzg.blobToKZGCommitment(hexInput);
    return hexToBytes(commitmentHex as `0x${string}`);
  };

  const computeBlobKzgProofAdapter = (
    blob: ByteArray,
    commitment: ByteArray
  ): ByteArray => {
    const hexBlob = bytesToHex(blob);
    const hexCommitment = bytesToHex(commitment);
    const proofHex = kzg.computeBlobKZGProof(hexBlob, hexCommitment);
    return hexToBytes(proofHex as `0x${string}`);
  };

  const adaptedKzg = {
    ...kzg,
    computeBlobKzgProof: computeBlobKzgProofAdapter,
    blobToKzgCommitment: blobToKzgCommitmentAdapter,
  };

  const txHash = await client.sendTransaction({
    account: account,
    blobs,
    kzg: adaptedKzg,
    maxFeePerBlobGas: parseGwei('30'),
    to: '0x0000000000000000000000000000000000000000',
    type: 'eip4844',
  });

  console.log(`Transaction sent: https://sepolia.blobscan.com/tx/${txHash}`);
}

signTransaction();
