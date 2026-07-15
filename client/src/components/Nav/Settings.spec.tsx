import React from 'react';
import { render, screen } from '@testing-library/react';
import Settings from './Settings';

const mockUseGetStartupConfig = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/usePersonalizationAccess', () => ({
  __esModule: true,
  default: () => ({
    hasMemoryOptOut: false,
    hasAnyPersonalizationFeature: false,
  }),
}));

jest.mock('@librechat/client', () => ({
  GearIcon: () => <span aria-hidden="true" />,
  DataIcon: () => <span aria-hidden="true" />,
  UserIcon: () => <span aria-hidden="true" />,
  SpeechIcon: () => <span aria-hidden="true" />,
  PersonalizationIcon: () => <span aria-hidden="true" />,
  useMediaQuery: () => false,
}));

jest.mock('./SettingsTabs', () => ({
  General: () => <div data-testid="general-panel" />,
  Chat: () => <div data-testid="chat-panel" />,
  Commands: () => <div data-testid="commands-panel" />,
  Speech: () => <div data-testid="speech-panel" />,
  Personalization: () => <div data-testid="personalization-panel" />,
  Data: () => <div data-testid="data-panel" />,
  Balance: () => <div data-testid="balance-panel" />,
  Account: () => <div data-testid="account-panel" />,
  About: () => <div data-testid="about-panel" />,
  WorkspaceProfile: () => <div data-testid="workspace-profile-panel" />,
}));

function renderSettings() {
  return render(<Settings open={true} onOpenChange={jest.fn()} />);
}

beforeEach(() => {
  mockUseGetStartupConfig.mockReturnValue({ data: {} });
});

describe('Settings', () => {
  // 360AI: the About and Commands tabs are hidden via a frontend flag, regardless
  // of the upstream buildInfo config. These tests lock in that override.
  it('hides the About tab even while startup config is loading', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined });

    renderSettings();

    expect(screen.queryByText('com_nav_setting_about')).not.toBeInTheDocument();
    expect(screen.queryByTestId('about-panel')).not.toBeInTheDocument();
  });

  it('keeps the About tab hidden even when buildInfo is enabled', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: { interface: { buildInfo: true } } });

    renderSettings();

    expect(screen.queryByText('com_nav_setting_about')).not.toBeInTheDocument();
  });

  it('hides the Commands tab', () => {
    renderSettings();

    expect(screen.queryByText('com_nav_commands')).not.toBeInTheDocument();
    expect(screen.queryByTestId('commands-panel')).not.toBeInTheDocument();
  });

  it('still renders the core tabs (General and Chat)', () => {
    renderSettings();

    expect(screen.getByText('com_nav_setting_general')).toBeInTheDocument();
    expect(screen.getByText('com_nav_setting_chat')).toBeInTheDocument();
  });
});
