import { render, screen } from 'test/layout-test-utils';
import JobCard from '../cards/JobCard';

describe('JobCard search variant', () => {
  it('renders title, company, workplace type, openings and posting link', () => {
    render(
      <JobCard
        variant="search"
        job={{
          id: 'j1',
          title: 'Engineer',
          company_name: 'Acme',
          workplace_type: 'remote',
          openings: 3,
          posting_url: 'https://jobs.acme.com/1',
          description: 'Build cool things.',
        }}
      />,
    );
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('remote')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View posting' })).toHaveAttribute(
      'href',
      'https://jobs.acme.com/1',
    );
  });
});

describe('JobCard list variant', () => {
  it('renders status pill and applications count', () => {
    render(
      <JobCard
        variant="list"
        job={{ id: 5, title: 'Designer', status: 'open', applications_count: 12 }}
      />,
    );
    expect(screen.getByText('Designer')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('12 applications')).toBeInTheDocument();
  });
});
