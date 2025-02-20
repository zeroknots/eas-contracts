import Contracts from '../../components/Contracts';
import { SchemaRegistry, SchemaResolver, TestEAS } from '../../typechain-types';
import { ZERO_ADDRESS, ZERO_BYTES, ZERO_BYTES32 } from '../../utils/Constants';
import { expectFailedAttestation, expectFailedMultiAttestations, registerSchema } from '../helpers/EAS';
import { latest } from '../helpers/Time';
import { createWallet } from '../helpers/Wallet';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Wallet } from 'ethers';
import { ethers } from 'hardhat';

describe('SchemaResolver', () => {
  let accounts: SignerWithAddress[];
  let recipient: SignerWithAddress;
  let sender: Wallet;

  let registry: SchemaRegistry;
  let eas: TestEAS;

  before(async () => {
    accounts = await ethers.getSigners();

    [recipient] = accounts;
  });

  beforeEach(async () => {
    sender = await createWallet();

    registry = await Contracts.SchemaRegistry.deploy();
    eas = await Contracts.TestEAS.deploy(registry.address);

    await eas.setTime(await latest());
  });

  describe('construction', () => {
    it('should revert when initialized with an invalid EAS', async () => {
      await expect(Contracts.TestSchemaResolver.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidEAS');
    });

    it('should be properly initialized', async () => {
      const resolver = await Contracts.TestSchemaResolver.deploy(eas.address);

      expect(await resolver.VERSION()).to.equal('0.28');
    });
  });

  describe('resolution', () => {
    const schema = 'bytes32 eventId,uint8 ticketType,uint32 ticketNum';
    let schemaId: string;
    const expirationTime = 0;
    const data = '0x1234';
    let resolver: SchemaResolver;

    context('with a standard resolver', () => {
      beforeEach(async () => {
        resolver = await Contracts.TestSchemaResolver.deploy(eas.address);
        schemaId = await registerSchema(schema, registry, resolver, true);
      });

      it('should revert when the attestation callback is invoked directly', async () => {
        const attestation = {
          uid: ZERO_BYTES32,
          schema: ZERO_BYTES32,
          refUID: ZERO_BYTES32,
          time: await latest(),
          expirationTime: 0,
          revocationTime: 0,
          revocable: true,
          recipient: recipient.address,
          attester: sender.address,
          data: ZERO_BYTES
        };

        await expect(resolver.attest(attestation)).to.be.revertedWith('AccessDenied');
        await expect(resolver.multiAttest([attestation, attestation], [0, 0])).to.be.revertedWith('AccessDenied');
      });

      it('should revert when the attestation revocation callback is invoked directly', async () => {
        const attestation = {
          uid: ZERO_BYTES32,
          schema: ZERO_BYTES32,
          refUID: ZERO_BYTES32,
          time: await latest(),
          expirationTime: 0,
          revocationTime: 0,
          revocable: true,
          recipient: recipient.address,
          attester: sender.address,
          data: ZERO_BYTES
        };

        await expect(resolver.revoke(attestation)).to.be.revertedWith('AccessDenied');
        await expect(resolver.multiRevoke([attestation, attestation], [0, 0])).to.be.revertedWith('AccessDenied');
      });

      context('as an EAS', () => {
        let sender: SignerWithAddress;

        before(() => {
          sender = accounts[0];
        });

        beforeEach(async () => {
          resolver = await Contracts.TestSchemaResolver.deploy(sender.address);
        });

        it('should revert when attempting to multi attest with more value than was actually sent', async () => {
          const attestation = {
            uid: ZERO_BYTES32,
            schema: ZERO_BYTES32,
            refUID: ZERO_BYTES32,
            time: await latest(),
            expirationTime: 0,
            revocationTime: 0,
            revocable: true,
            recipient: recipient.address,
            attester: sender.address,
            data: ZERO_BYTES
          };
          const value = 12345;

          await expect(resolver.multiAttest([attestation, attestation], [value, value], { value })).to.be.revertedWith(
            'InsufficientValue'
          );
          await expect(resolver.multiAttest([attestation, attestation], [value - 1, 2], { value })).to.be.revertedWith(
            'InsufficientValue'
          );
        });

        it('should revert when attempting to multi revoke with more value than was actually sent', async () => {
          const attestation = {
            uid: ZERO_BYTES32,
            schema: ZERO_BYTES32,
            refUID: ZERO_BYTES32,
            time: await latest(),
            expirationTime: 0,
            revocationTime: 0,
            revocable: true,
            recipient: recipient.address,
            attester: sender.address,
            data: ZERO_BYTES
          };
          const value = 12345;

          await expect(resolver.multiRevoke([attestation, attestation], [value, value], { value })).to.be.revertedWith(
            'InsufficientValue'
          );
          await expect(resolver.multiRevoke([attestation, attestation], [value - 1, 2], { value })).to.be.revertedWith(
            'InsufficientValue'
          );
        });
      });
    });

    context('with a non-payable resolver', () => {
      beforeEach(async () => {
        resolver = await Contracts.TestSchemaResolver.deploy(eas.address);
        expect(await resolver.isPayable()).to.be.false;

        schemaId = await registerSchema(schema, registry, resolver, true);
      });

      it('should revert when sending', async () => {
        const value = 1;

        await expect(sender.sendTransaction({ to: resolver.address, value })).to.be.revertedWith('NotPayable');

        await expectFailedAttestation(
          { eas },
          schemaId,
          { recipient: recipient.address, expirationTime, data, value },
          { value, from: sender },
          'NotPayable'
        );

        await expectFailedMultiAttestations(
          { eas },
          [
            {
              schema: schemaId,
              requests: [
                { recipient: recipient.address, expirationTime, data, value },
                { recipient: recipient.address, expirationTime, data, value }
              ]
            }
          ],
          { value, from: sender },
          'NotPayable'
        );
      });
    });

    context('without any resolvers', () => {
      beforeEach(async () => {
        schemaId = await registerSchema(schema, registry, ZERO_ADDRESS, true);
      });

      it('should revert when sending', async () => {
        const value = 1;

        await expectFailedAttestation(
          { eas },
          schemaId,
          { recipient: recipient.address, expirationTime, data, value },
          { value, from: sender },
          'NotPayable'
        );

        await expectFailedMultiAttestations(
          { eas },
          [
            {
              schema: schemaId,
              requests: [
                { recipient: recipient.address, expirationTime, data, value },
                { recipient: recipient.address, expirationTime, data, value }
              ]
            }
          ],
          { value, from: sender },
          'NotPayable'
        );
      });
    });
  });
});
