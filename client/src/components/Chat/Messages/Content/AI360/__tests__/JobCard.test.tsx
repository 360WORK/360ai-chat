import { render, screen } from 'test/layout-test-utils';
import JobCard from '../cards/JobCard';

describe('JobCard search variant (compact)', () => {
  it('renders title, company meta, workplace-type pill and links to the posting', () => {
    render(
      <JobCard
        variant="search"
        job={{
          id: 'j1',
          title: 'Engineer',
          company_name: 'Acme',
          location: 'London',
          workplace_type: 'remote',
          posting_url: 'https://jobs.acme.com/1',
        }}
      />,
    );
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme · London')).toBeInTheDocument();
    expect(screen.getByText('remote')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://jobs.acme.com/1');
  });
});

describe('JobCard list variant (compact)', () => {
  it('renders status pill and applications meta, with no link', () => {
    render(
      <JobCard
        variant="list"
        job={{ id: 5, title: 'Designer', status: 'open', applications_count: 12 }}
      />,
    );
    expect(screen.getByText('Designer')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('12 applications')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
