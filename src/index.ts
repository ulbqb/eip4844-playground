import dotenv from 'dotenv';
import { loadKZG } from 'kzg-wasm';
import {
  ByteArray,
  bytesToHex,
  createWalletClient,
  hexToBytes,
  http,
  parseGwei,
  sha256,
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

  // Sign the transaction
  const serializedTx = await account.signTransaction(request);

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

async function KZGProofVerification() {
  const kzg = await loadKZG();

  const blobs = toBlobs({
    data: stringToHex('hello world'),
  });

  // get blob data
  const blobData = blobs[0];
  // get kzg commitment
  const kzgCommitment = kzg.blobToKZGCommitment(blobData);
  // get kzg proof
  const kzgProof = kzg.computeBlobKZGProof(blobData, kzgCommitment);
  // validate blob existence using proof
  const isValid = kzg.verifyBlobKZGProof(blobData, kzgCommitment, kzgProof);

  console.log(`Blob existence validated: ${isValid}`);
}

async function makeBlobVersionedHashes() {
  const kzg = await loadKZG();
  const blobs = toBlobs({ data: stringToHex('hello world') });
  const blobVersionedHashes = blobs.map((blob) =>
    kzg.blobToKZGCommitment(blob)
  );

  const versioned_hash = sha256(blobVersionedHashes[0] as `0x${string}`);

  const account = privateKeyToAccount(PRIVATE_KEY);
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });
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

  console.log(request.blobVersionedHashes[0]);
  console.log(versioned_hash);
}

KZGProofVerification();
