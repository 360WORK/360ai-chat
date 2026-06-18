import { render, screen } from 'test/layout-test-utils';
import CompanyCard from '../cards/CompanyCard';

const base = {
  name: 'Acme',
  website: 'https://acme.com',
  linkedin_url: 'https://www.linkedin.com/company/acme',
  industry: 'Software',
  employee_range: '1001-5000',
  location: 'Berlin, Germany',
  description: 'We build things.',
};

describe('CompanyCard (compact card)', () => {
  it('renders name, the meta line, and the employee-range pill', () => {
    render(<CompanyCard company={base} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Software · Berlin, Germany')).toBeInTheDocument();
    expect(screen.getByText('1001-5000')).toBeInTheDocument();
  });

  it('links the row to the website', () => {
    render(<CompanyCard company={base} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://acme.com');
  });

  it('falls back to the LinkedIn URL when no website', () => {
    render(
      <CompanyCard
        company={{ name: 'LinkedInOnly', linkedin_url: 'https://www.linkedin.com/company/x' }}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://www.linkedin.com/company/x',
    );
  });

  it('renders a non-link row when no URLs are present', () => {
    render(<CompanyCard company={{ name: 'NoLinks' }} />);
    expect(screen.getByText('NoLinks')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
