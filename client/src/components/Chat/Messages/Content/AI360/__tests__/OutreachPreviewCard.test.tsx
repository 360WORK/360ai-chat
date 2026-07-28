import { render, screen } from '@testing-library/react';
import OutreachPreviewCard from '../cards/OutreachPreviewCard';

jest.mock('~/hooks', () => ({ useLocalize: () => (k: string) => k }));

test('preview shows draft and an awaiting-confirmation affordance, not a sent state', () => {
  render(<OutreachPreviewCard outreach={{ status: 'preview', channel: 'email', recipient: 'jane@acme.com', subject: 'Opportunity', body: 'Hi Jane.' }} />);
  expect(screen.getByText('jane@acme.com')).toBeInTheDocument();
  expect(screen.getByText('Hi Jane.')).toBeInTheDocument();
  expect(screen.getByText('com_ui_360_outreach_awaiting')).toBeInTheDocument();
});

test('sent state shows a confirmation', () => {
  render(<OutreachPreviewCard outreach={{ status: 'sent', channel: 'email', recipient: 'jane@acme.com', body: 'Hi Jane.' }} />);
  expect(screen.getByText('com_ui_360_outreach_sent')).toBeInTheDocument();
});
