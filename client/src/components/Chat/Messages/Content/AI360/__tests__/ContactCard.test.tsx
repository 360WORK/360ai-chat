import { render, screen } from '@testing-library/react';
import ContactCard from '../cards/ContactCard';

jest.mock('~/hooks', () => ({ useLocalize: () => (k: string) => k }));

test('renders verified emails and phones', () => {
  render(
    <ContactCard
      contact={{
        full_name: 'Jane Doe',
        work_emails: ['jane@acme.com'],
        phones: ['+15551234567'],
        linkedin_url: 'https://linkedin.com/in/jane-doe',
      }}
    />,
  );
  expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  expect(screen.getByText('jane@acme.com')).toBeInTheDocument();
  expect(screen.getByText('+15551234567')).toBeInTheDocument();
});

test('renders gracefully with no contact channels', () => {
  render(<ContactCard contact={{ full_name: 'No Contacts' }} />);
  expect(screen.getByText('No Contacts')).toBeInTheDocument();
});
