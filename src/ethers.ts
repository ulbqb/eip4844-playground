import dotenv from 'dotenv';
import {
  concat,
  hexlify,
  JsonRpcProvider,
  parseEther,
  toUtf8Bytes,
  Transaction,
  Wallet,
} from 'ethers';
import { loadKZG } from 'kzg-wasm';
dotenv.config({ quiet: true });

const privateKey = process.env.PRIVATE_KEY || '';

async function main() {
  const eip = process.argv[2] as '4844' | '7594';
  console.log(`testing ${eip}...`);
  const kzg = await loadKZG();
  const provider = new JsonRpcProvider('https://11155111.rpc.thirdweb.com');
  const wallet = new Wallet(privateKey, provider);
  const feeData = await provider.getFeeData();

  const tx = new Transaction();
  tx.to = '0x9F3f11d72d96910df008Cfe3aBA40F361D2EED03';
  tx.value = parseEther('0');
  tx.gasLimit = 50_000;
  tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  tx.maxFeePerGas = feeData.maxFeePerGas;
  tx.data = '0x5468697320697320612074657374207472616e73616374696f6e21';
  tx.nonce = await provider.getTransactionCount(wallet.getAddress());
  tx.type = 3;
  tx.chainId = 11_155_111;
  tx.accessList = [
    {
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      storageKeys: [
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000003',
      ],
    },
  ];
  tx.maxFeePerBlobGas = 400_000_000_000;
  if (eip === '7594') {
    tx.blobWrapperVersion = 1;
  }
  // specify the fully-valid BLOB array: 32 (`BYTES_PER_FIELD_ELEMENT`) * 4096 (`FIELD_ELEMENTS_PER_BLOB`)
  const blob = new Uint8Array(32 * 4_096);
  const data = toUtf8Bytes('Long live the BLOBs!');
  blob.set(data, 0);
  const blobHex = hexlify(blob);
  const commitment = kzg.blobToKZGCommitment(blobHex);
  let proof: string;
  if (eip === '4844') {
    proof = kzg.computeBlobKZGProof(blobHex, commitment);
  } else {
    proof = concat(kzg.computeCellsAndKZGProofs(blobHex).proofs);
  }
  tx.blobs = [{ data: blobHex, commitment: commitment, proof: proof }];

  const rawTx = await wallet.signTransaction(tx);
  const res = await provider.send('eth_sendRawTransaction', [rawTx]);
  console.log(rawTx.length);
  console.log(res);
}

main();
