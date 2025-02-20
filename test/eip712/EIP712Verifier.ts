import Contracts from '../../components/Contracts';
import { TestEIP712Verifier } from '../../typechain-types';
import { NO_EXPIRATION, ZERO_ADDRESS, ZERO_BYTES, ZERO_BYTES32 } from '../../utils/Constants';
import { ATTEST_TYPED_SIGNATURE, EIP712Utils, REVOKE_TYPED_SIGNATURE } from '../helpers/EIP712Utils';
import { createWallet } from '../helpers/Wallet';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Wallet } from 'ethers';
import { ethers } from 'hardhat';

const {
  utils: { formatBytes32String, keccak256, toUtf8Bytes, hexlify }
} = ethers;

const EIP712_NAME = 'EAS';

describe('EIP712Verifier', () => {
  let accounts: SignerWithAddress[];
  let sender: Wallet;
  let sender2: Wallet;
  let recipient: SignerWithAddress;

  let verifier: TestEIP712Verifier;
  let eip712Utils: EIP712Utils;

  before(async () => {
    accounts = await ethers.getSigners();

    [recipient] = accounts;
  });

  beforeEach(async () => {
    sender = await createWallet();
    sender2 = await createWallet();

    verifier = await Contracts.TestEIP712Verifier.deploy(EIP712_NAME);

    eip712Utils = await EIP712Utils.fromVerifier(verifier);
  });

  describe('construction', () => {
    it('should revert when initialized with an empty schema registry', async () => {
      await expect(Contracts.EAS.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidRegistry');
    });

    it('should be properly initialized', async () => {
      expect(await verifier.getDomainSeparator()).to.equal(eip712Utils.getDomainSeparator(EIP712_NAME));
      expect(await verifier.getAttestTypeHash()).to.equal(keccak256(toUtf8Bytes(ATTEST_TYPED_SIGNATURE)));
      expect(await verifier.getRevokeTypeHash()).to.equal(keccak256(toUtf8Bytes(REVOKE_TYPED_SIGNATURE)));
      expect(await verifier.getName()).to.equal(EIP712_NAME);
    });
  });

  describe('verify attest', () => {
    interface AttestationRequestData {
      recipient: string;
      expirationTime: number;
      revocable: boolean;
      refUID: string;
      data: string;
      value: number;
    }

    const schema = ZERO_BYTES32;
    let attestationRequest: AttestationRequestData;

    beforeEach(() => {
      attestationRequest = {
        recipient: recipient.address,
        expirationTime: NO_EXPIRATION,
        revocable: true,
        refUID: ZERO_BYTES32,
        data: ZERO_BYTES,
        value: 1000
      };
    });

    it('should verify delegated attestation request', async () => {
      for (let i = 0; i < 3; ++i) {
        const signature = await eip712Utils.signDelegatedAttestation(
          sender,
          schema,
          attestationRequest.recipient,
          attestationRequest.expirationTime,
          attestationRequest.revocable,
          attestationRequest.refUID,
          attestationRequest.data,
          await verifier.getNonce(sender.address)
        );

        await expect(
          verifier.verifyAttest({
            schema,
            data: attestationRequest,
            signature: { v: signature.v, r: hexlify(signature.r), s: hexlify(signature.s) },
            attester: sender.address
          })
        ).not.to.be.reverted;
      }
    });

    it('should revert when verifying delegated attestation request with a wrong signature', async () => {
      const signature = await eip712Utils.signDelegatedAttestation(
        sender,
        schema,
        attestationRequest.recipient,
        attestationRequest.expirationTime,
        attestationRequest.revocable,
        attestationRequest.refUID,
        attestationRequest.data,
        await verifier.getNonce(sender.address)
      );

      await expect(
        verifier.verifyAttest({
          schema,
          data: attestationRequest,
          signature: { v: signature.v, r: formatBytes32String('BAD'), s: hexlify(signature.s) },
          attester: sender.address
        })
      ).to.be.revertedWith('InvalidSignature');

      await expect(
        verifier.verifyAttest({
          schema,
          data: attestationRequest,
          signature: { v: signature.v, r: hexlify(signature.r), s: hexlify(signature.s) },
          attester: sender2.address
        })
      ).to.be.revertedWith('InvalidSignature');
    });
  });

  describe('verify revoke', () => {
    const schema = ZERO_BYTES32;

    const revocationRequest = {
      uid: ZERO_BYTES32,
      value: 1000
    };

    it('should verify delegated revocation request', async () => {
      for (let i = 0; i < 3; ++i) {
        const signature = await eip712Utils.signDelegatedRevocation(
          sender,
          schema,
          revocationRequest.uid,
          await verifier.getNonce(sender.address)
        );

        await expect(
          verifier.verifyRevoke({
            schema,
            data: revocationRequest,
            signature: { v: signature.v, r: hexlify(signature.r), s: hexlify(signature.s) },
            revoker: sender.address
          })
        ).not.to.be.reverted;
      }
    });

    it('should revert when verifying delegated revocation request with a wrong signature', async () => {
      const signature = await eip712Utils.signDelegatedRevocation(
        sender,
        schema,
        revocationRequest.uid,
        await verifier.getNonce(sender.address)
      );

      await expect(
        verifier.verifyRevoke({
          schema,
          data: revocationRequest,
          signature: { v: signature.v, r: formatBytes32String('BAD'), s: hexlify(signature.s) },
          revoker: sender.address
        })
      ).to.be.revertedWith('InvalidSignature');

      await expect(
        verifier.verifyRevoke({
          schema,
          data: revocationRequest,
          signature: { v: signature.v, r: hexlify(signature.r), s: hexlify(signature.s) },
          revoker: sender2.address
        })
      ).to.be.revertedWith('InvalidSignature');
    });
  });
});
