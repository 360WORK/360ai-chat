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
});
