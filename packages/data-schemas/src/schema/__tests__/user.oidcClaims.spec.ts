import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import userSchema from '../user';

/**
 * Round-trip test for the `oidcClaims` sub-schema on `userSchema`.
 *
 * Pins the contract that:
 *  - A user created WITH a full `oidcClaims` object round-trips with deep
 *    equality (the sub-schema shape is preserved).
 *  - A user created WITHOUT `oidcClaims` reads back as `undefined` — NOT `{}`.
 *
 * The second case is the critical regression guard for the fix that dropped
 * `default: {}` from the sub-schema: an empty object is truthy and would slip
 * past the `!oidcClaims` guard in `onboardingContextPart`, routing local /
 * legacy users into the onboarding interview. Absent must stay `undefined` to
 * match the `extractOnboardingClaims` mapper's `undefined`-on-absent contract.
 */
describe('userSchema.oidcClaims round-trip', () => {
  let mongoServer: MongoMemoryServer;
  let User: mongoose.Model<any>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    User = mongoose.model('User_OidcClaims_Test', userSchema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  it('round-trips a full oidcClaims object with deep equality', async () => {
    const claims = {
      isOwner: true,
      role: 'owner',
      clientId: 'c1',
      clientName: 'Acme',
      companyOnboarded: true,
      personalOnboarded: false,
    };

    const created = await User.create({
      email: 'owner@example.com',
      provider: 'openid',
      emailVerified: true,
      oidcClaims: claims,
    });

    const refetched = await User.findById(created._id).lean();
    expect(refetched).not.toBeNull();
    expect(refetched!.oidcClaims).toEqual(claims);
  });

  it('reads oidcClaims as undefined (NOT {}) when absent on create', async () => {
    const created = await User.create({
      email: 'local@example.com',
      provider: 'local',
      emailVerified: true,
      // intentionally no oidcClaims
    });

    const refetched = await User.findById(created._id).lean();
    expect(refetched).not.toBeNull();
    // The fix: no `default: {}` on the sub-schema, so absent stays undefined.
    expect(refetched!.oidcClaims).toBeUndefined();
  });
});
