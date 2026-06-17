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

describe('CompanyCard', () => {
  it('renders name, industry, location, employee range', () => {
    render(<CompanyCard company={base} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Software')).toBeInTheDocument();
    expect(screen.getByText('Berlin, Germany')).toBeInTheDocument();
    expect(screen.getByText('1001-5000')).toBeInTheDocument();
  });

  it('renders Website and LinkedIn links', () => {
    render(<CompanyCard company={base} />);
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://acme.com');
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/company/acme',
    );
  });

  it('hides links when URLs are missing', () => {
    render(<CompanyCard company={{ name: 'NoLinks' }} />);
    expect(screen.queryByRole('link', { name: 'Website' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'LinkedIn' })).not.toBeInTheDocument();
  });
});
