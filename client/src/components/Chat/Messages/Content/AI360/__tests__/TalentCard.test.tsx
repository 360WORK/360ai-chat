import { render, screen } from 'test/layout-test-utils';
import TalentCard from '../cards/TalentCard';

describe('TalentCard', () => {
  it('renders name, title, company, location, years, skills', () => {
    render(
      <TalentCard
        talent={{
          name: 'Jane Doe',
          title: 'Product Manager',
          current_company: 'Acme',
          location: 'Berlin',
          years_experience: 8,
          skills: ['SQL', 'Figma'],
          open_to_work: true,
          profile_url: 'https://360ai.test/talent/1',
          linkedin_url: 'https://linkedin.com/in/jane',
        }}
      />,
    );
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/Product Manager/)).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('8 yrs')).toBeInTheDocument();
    expect(screen.getByText('SQL')).toBeInTheDocument();
    expect(screen.getByText('Open to work')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute(
      'href',
      'https://360ai.test/talent/1',
    );
  });

  it('hides open-to-work badge and profile link when absent', () => {
    render(<TalentCard talent={{ name: 'John Roe' }} />);
    expect(screen.queryByText('Open to work')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View profile' })).not.toBeInTheDocument();
  });

  it('renders candidate summary when present', () => {
    render(<TalentCard talent={{ name: 'Sam', summary: 'Backend engineer' }} />);
    expect(screen.getByText('Backend engineer')).toBeInTheDocument();
  });
});
