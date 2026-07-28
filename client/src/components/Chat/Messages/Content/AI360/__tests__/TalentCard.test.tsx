import { render, screen } from 'test/layout-test-utils';
import TalentCard from '../cards/TalentCard';

describe('TalentCard (compact row)', () => {
  it('renders name, the meta line, and an open-to-work badge; links to the profile', () => {
    render(
      <TalentCard
        talent={{
          name: 'Jane Doe',
          title: 'Product Manager',
          current_company: 'Acme',
          location: 'Berlin',
          open_to_work: true,
          profile_url: 'https://360ai.test/talent/1',
          linkedin_url: 'https://linkedin.com/in/jane',
        }}
      />,
    );
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Product Manager · Acme · Berlin')).toBeInTheDocument();
    expect(screen.getByText('Open to work')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://360ai.test/talent/1');
  });

  it('falls back to the LinkedIn URL for the row link when no profile_url', () => {
    render(<TalentCard talent={{ name: 'Sam', linkedin_url: 'https://linkedin.com/in/sam' }} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://linkedin.com/in/sam');
  });

  it('renders a non-link row and no badge when profile/open_to_work absent', () => {
    render(<TalentCard talent={{ name: 'John Roe' }} />);
    expect(screen.getByText('John Roe')).toBeInTheDocument();
    expect(screen.queryByText('Open to work')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
