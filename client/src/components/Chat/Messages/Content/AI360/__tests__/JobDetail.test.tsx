import { render, screen } from 'test/layout-test-utils';
import JobDetailCard from '../cards/JobDetail';

describe('JobDetailCard', () => {
  it('renders title, meta fields, and pipeline stages', () => {
    render(
      <JobDetailCard
        job={{
          id: 9,
          title: 'Staff Engineer',
          status: 'open',
          department: 'Engineering',
          employment_type: 'Full-time',
          seniority_level: 'Staff',
          remote_type: 'Hybrid',
          salary_range: '$180k–$220k',
          location: 'NYC',
          applications_count: 14,
          description: 'Lead the platform team.',
          pipeline: [
            { name: 'Applied', order: 1, candidates_count: 10 },
            { name: 'Screen', order: 2, candidates_count: 4 },
          ],
        }}
      />,
    );
    expect(screen.getByText('Staff Engineer')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('$180k–$220k')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Screen')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('hides meta grid fields when value is null or undefined', () => {
    render(
      <JobDetailCard
        job={{
          id: 10,
          title: 'Senior Designer',
          status: 'closed',
          department: null,
          employment_type: 'Full-time',
          seniority_level: undefined,
          remote_type: 'Remote',
          salary_range: undefined,
          location: 'San Francisco',
          applications_count: 8,
          description: 'Design next-gen UI.',
          pipeline: [],
        }}
      />,
    );
    expect(screen.getByText('Senior Designer')).toBeInTheDocument();
    expect(screen.queryByText('Department')).not.toBeInTheDocument();
    expect(screen.queryByText('Seniority')).not.toBeInTheDocument();
    expect(screen.queryByText('Salary')).not.toBeInTheDocument();
    expect(screen.getAllByText('Full-time').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Remote').length).toBeGreaterThan(0);
    expect(screen.getAllByText('San Francisco').length).toBeGreaterThan(0);
  });

  it('renders pipeline stages sorted by order regardless of input order', () => {
    render(
      <JobDetailCard
        job={{
          id: 11,
          title: 'Product Manager',
          status: 'open',
          department: 'Product',
          employment_type: 'Full-time',
          seniority_level: 'Senior',
          remote_type: 'Hybrid',
          salary_range: '$160k–$200k',
          location: 'Austin',
          applications_count: 22,
          description: 'Own the roadmap.',
          pipeline: [
            { name: 'Screen', order: 2, candidates_count: 4 },
            { name: 'Interview', order: 3, candidates_count: 1 },
            { name: 'Applied', order: 1, candidates_count: 10 },
          ],
        }}
      />,
    );
    const stageNames = screen.getAllByText(/Applied|Screen|Interview/);
    expect(stageNames[0]).toHaveTextContent('Applied');
    expect(stageNames[1]).toHaveTextContent('Screen');
    expect(stageNames[2]).toHaveTextContent('Interview');
  });
});
