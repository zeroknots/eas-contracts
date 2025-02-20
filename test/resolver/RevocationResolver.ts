import Contracts from '../../components/Contracts';
import { RevocationResolver, SchemaRegistry, TestEAS } from '../../typechain-types';
import { ZERO_BYTES32 } from '../../utils/Constants';
import { getUIDFromAttestTx } from '../../utils/EAS';
import {
  expectFailedMultiRevocations,
  expectFailedRevocation,
  expectMultiRevocations,
  expectRevocation,
  registerSchema
} from '../helpers/EAS';
import { latest } from '../helpers/Time';
import { createWallet } from '../helpers/Wallet';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Wallet } from 'ethers';
import { ethers } from 'hardhat';

describe('RevocationResolver', () => {
  let accounts: SignerWithAddress[];
  let recipient: SignerWithAddress;
  let sender: Wallet;

  let registry: SchemaRegistry;
  let eas: TestEAS;
  let resolver: RevocationResolver;
  let uid: string;
  let uids: string[] = [];

  const schema = 'bytes32 eventId,uint8 ticketType,uint32 ticketNum';
  let schemaId: string;
  const data = '0x1234';
  const expirationTime = 0;

  before(async () => {
    accounts = await ethers.getSigners();

    [recipient] = accounts;
  });

  beforeEach(async () => {
    sender = await createWallet();

    registry = await Contracts.SchemaRegistry.deploy();
    eas = await Contracts.TestEAS.deploy(registry.address);

    await eas.setTime(await latest());

    resolver = await Contracts.RevocationResolver.deploy(eas.address);
    expect(await resolver.isPayable()).to.be.false;

    schemaId = await registerSchema(schema, registry, resolver, true);

    uid = await getUIDFromAttestTx(
      eas.connect(sender).attest({
        schema: schemaId,
        data: {
          recipient: recipient.address,
          expirationTime,
          revocable: true,
          refUID: ZERO_BYTES32,
          data,
          value: 0
        }
      })
    );

    uids = [];

    for (let i = 0; i < 2; i++) {
      uids.push(
        await getUIDFromAttestTx(
          eas.connect(sender).attest({
            schema: schemaId,
            data: {
              recipient: recipient.address,
              expirationTime,
              revocable: true,
              refUID: ZERO_BYTES32,
              data,
              value: 0
            }
          })
        )
      );
    }
  });

  context('when revocations are allowed', () => {
    beforeEach(async () => {
      await resolver.setRevocation(true);
    });

    it('should allow revoking an existing attestation', async () => {
      await expectRevocation({ eas }, schemaId, { uid }, { from: sender });

      await expectMultiRevocations({ eas }, [{ schema: schemaId, requests: uids.map((uid) => ({ uid })) }], {
        from: sender
      });
    });
  });

  context('when revocations are not allowed', () => {
    beforeEach(async () => {
      await resolver.setRevocation(false);
    });

    it('should revert when attempting to revoke an existing attestation', async () => {
      await expectFailedRevocation({ eas }, schemaId, { uid }, { from: sender }, 'InvalidRevocation');

      await expectFailedMultiRevocations(
        { eas },
        [{ schema: schemaId, requests: uids.map((uid) => ({ uid })) }],
        { from: sender },
        'InvalidRevocation'
      );
    });
  });
});
