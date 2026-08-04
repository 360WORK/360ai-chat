import { atom } from 'recoil';

/**
 * True when a signals sync delivered new digest messages the user has not yet
 * seen; cleared when the Signals panel is opened.
 */
const signalsUnread = atom<boolean>({
  key: 'signalsUnread',
  default: false,
});

export default { signalsUnread };
