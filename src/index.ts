import * as cKzg from 'c-kzg';
import dotenv from 'dotenv';
import { loadKZG } from 'kzg-wasm';
import { resolve } from 'node:path';
import {
  bytesToHex,
  concat,
  createPublicClient,
  createWalletClient,
  Hex,
  hexToBytes,
  http,
  parseGwei,
  parseTransaction,
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

const VERSIONED_HASH_VERSION_KZG = hexToBytes('0x01' as Hex);
const POINT_EVALUATION_PRECOMPILE_ADDRESS =
  '0x000000000000000000000000000000000000000A';

const privateKey = process.env.PRIVATE_KEY as Hex;
const mainnetTrustedSetupPath = resolve(
  './node_modules/viem/trusted-setups/mainnet.json'
);

async function experimentWithBlob(sendTransaction: boolean = false) {
  // setup client
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: sepolia,
    transport: http(),
  });
  // setup public client
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });
  // setup clang kzg
  cKzg.loadTrustedSetup(0, mainnetTrustedSetupPath);
  // setup wasm kzg
  const wasmKzg = await loadKZG();
  wasmKzg.loadTrustedSetup(0);
  // blob data
  const blobs = toBlobs({ data: stringToHex('hello world') });
  if (blobs.length !== 1) {
    throw new Error('Only one blob is assumed in this example');
  }
  const blob = blobs[0];

  /*
   experiment 1: send blob transaction using clang kzg
  */
  let versionedHash = '0x' as Hex;
  let commitment = '0x' as Hex;
  let proof = '0x' as Hex;
  {
    console.log('### experiment 1: Sending blob transaction using clang kzg');

    commitment = bytesToHex(cKzg.blobToKzgCommitment(hexToBytes(blob as Hex)));
    proof = bytesToHex(
      cKzg.computeBlobKzgProof(
        hexToBytes(blob as Hex),
        hexToBytes(commitment as Hex)
      )
    );
    const request = await client.prepareTransactionRequest({
      account: account,
      blobs,
      kzg: cKzg,
      maxFeePerBlobGas: parseGwei('30'),
      to: '0x0000000000000000000000000000000000000000',
      type: 'eip4844',
      sidecars: [
        {
          blob: blob,
          commitment: commitment,
          proof: proof,
        },
      ],
    });
    versionedHash = request.blobVersionedHashes![0];
    const serializedTx = await account.signTransaction(request);
    console.log(
      `transaction: ${JSON.stringify(parseTransaction(serializedTx), bigintReplacer, 2)}`
    );
    console.log(`raw transaction: ${serializedTx}`);

    if (sendTransaction) {
      const txHash = await client.sendRawTransaction({
        serializedTransaction: serializedTx,
      });
      console.log(
        `transaction result: https://sepolia.blobscan.com/tx/${txHash}`
      );
      await timeout(5000); // wait for 5 seconds
      const transaction = await publicClient.getTransaction({
        hash: txHash,
      });
      if (!equalHex(versionedHash, transaction?.blobVersionedHashes![0])) {
        throw new Error('Versioned hash mismatch');
      }
      console.log(
        `note: you can fetch blob data from beacon api /eth/v1/beacon/blobs/{block_id}, for further details, please check https://ethereum.github.io/beacon-APIs/#/Beacon/getBlobs`
      );
    } else {
      console.log(
        'note: please set sendTransaction to true if you want to send the transaction'
      );
    }

    console.log();
    console.log();
  }

  /*
    experiment 2: check how to calculate blob versioned hash
  */
  {
    console.log('### experiment 2: check how to calculate blob versioned hash');

    const commitment = cKzg.blobToKzgCommitment(hexToBytes(blob as Hex));
    console.log(`commitment: ${bytesToHex(commitment)}`);
    const _versionedHash = hexToBytes(sha256(commitment));
    console.log(`sha256-hashed commitment: ${bytesToHex(_versionedHash)}`);
    _versionedHash[0] = VERSIONED_HASH_VERSION_KZG[0];
    console.log(`versioned hash: ${bytesToHex(_versionedHash)}`);
    if (!equalHex(bytesToHex(_versionedHash), versionedHash)) {
      throw new Error('versioned hash mismatch');
    }
    console.log();
    console.log();
  }

  /*
    experiment 3: check efficiency of verification with proof vs without proof
  */
  {
    console.log(
      '### experiment 3: check efficiency of verification with proof vs without proof'
    );
    {
      const hrstart = process.hrtime();
      const commitment = cKzg.blobToKzgCommitment(hexToBytes(blob as Hex));
      const _versionedHash = hexToBytes(sha256(commitment));
      _versionedHash[0] = VERSIONED_HASH_VERSION_KZG[0];
      if (!equalHex(bytesToHex(_versionedHash), versionedHash)) {
        throw new Error('Versioned hash mismatch');
      }
      const hrend = process.hrtime(hrstart);
      console.log(
        `verification without proof took ${hrend[1] / 1000000} milliseconds`
      );
    }

    {
      const hrstart = process.hrtime();
      const _versionedHash = hexToBytes(sha256(commitment));
      _versionedHash[0] = VERSIONED_HASH_VERSION_KZG[0];
      const isValid = cKzg.verifyBlobKzgProof(
        hexToBytes(blob as Hex),
        hexToBytes(commitment as Hex),
        hexToBytes(proof as Hex)
      );
      if (!equalHex(bytesToHex(_versionedHash), versionedHash)) {
        throw new Error('Versioned hash mismatch');
      }
      if (!isValid) {
        throw new Error('Proof verification failed');
      }
      const hrend = process.hrtime(hrstart);
      console.log(
        `verification with proof took ${hrend[1] / 1000000} milliseconds`
      );
    }

    console.log();
    console.log();
  }

  /*
    experiment 4: verify kzg proof for a point off chain
  */
  {
    console.log('### experiment 4: verify kzg proof for a point off chain');
    const zBytes = hexToBytes(blob as Hex).slice(0, 32);
    const PointProof = cKzg.computeKzgProof(hexToBytes(blob as Hex), zBytes);
    const isValid = cKzg.verifyKzgProof(
      hexToBytes(commitment as Hex),
      zBytes,
      PointProof[1],
      PointProof[0]
    );
    console.log(
      `arguments: ${JSON.stringify(
        {
          commitment,
          zBytes: bytesToHex(zBytes),
          yBytes: bytesToHex(PointProof[1]),
          proofBytes: bytesToHex(PointProof[0]),
        },
        bigintReplacer,
        2
      )}`
    );
    console.log(`result: ${isValid}`);

    console.log();
    console.log();
  }

  /*
    experiment 5: verify kzg proof for a point on chain
  */
  {
    console.log('### experiment 5: verify kzg proof for a point on chain');
    const zBytes = hexToBytes(blob as Hex).slice(0, 32);
    const PointProof = cKzg.computeKzgProof(hexToBytes(blob as Hex), zBytes);
    const result = await publicClient.call({
      to: POINT_EVALUATION_PRECOMPILE_ADDRESS,
      data: concat([
        versionedHash,
        bytesToHex(zBytes),
        bytesToHex(PointProof[1]),
        commitment,
        bytesToHex(PointProof[0]),
      ]),
    });
    console.log(`address: ${POINT_EVALUATION_PRECOMPILE_ADDRESS}`);
    console.log(
      `arguments: ${JSON.stringify(
        {
          versionedHash,
          zBytes: bytesToHex(zBytes),
          yBytes: bytesToHex(PointProof[1]),
          commitment,
          proofBytes: bytesToHex(PointProof[0]),
        },
        bigintReplacer,
        2
      )}`
    );
    console.log(`result: ${JSON.stringify(result, bigintReplacer, 2)}`);

    console.log();
    console.log();
  }

  /*
    experiment 6: check efficiency of clang kzg vs wasm kzg
  */
  {
    console.log('### experiment 6: check efficiency of wasm kzg vs clang kzg');
    {
      const hrstart = process.hrtime();
      const _commitment = cKzg.blobToKzgCommitment(hexToBytes(blob as Hex));
      const _proof = cKzg.computeBlobKzgProof(
        hexToBytes(blob as Hex),
        _commitment
      );
      const hrend = process.hrtime(hrstart);
      if (!equalHex(bytesToHex(_commitment), commitment)) {
        throw new Error('Commitment mismatch');
      }
      if (!equalHex(bytesToHex(_proof), proof)) {
        throw new Error('Proof mismatch');
      }
      console.log(`clang kzg took ${hrend[1] / 1000000} milliseconds`);
    }

    {
      const hrstart = process.hrtime();
      const _commitment = wasmKzg.blobToKZGCommitment(blob) as Hex;
      const _proof = wasmKzg.computeBlobKZGProof(blob, _commitment) as Hex;
      const hrend = process.hrtime(hrstart);
      if (!equalHex(_commitment, commitment)) {
        throw new Error('Commitment mismatch');
      }
      if (!equalHex(_proof, proof)) {
        throw new Error('Proof mismatch');
      }
      console.log(`wasm kzg took ${hrend[1] / 1000000} milliseconds`);
    }
  }
}

experimentWithBlob(true);

function bigintReplacer(_key: string, value: any) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function equalHex(a: Hex, b: Hex) {
  return a.toLowerCase() === b.toLowerCase();
}

async function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
