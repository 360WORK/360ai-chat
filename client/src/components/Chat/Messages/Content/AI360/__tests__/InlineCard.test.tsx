import { render, screen } from 'test/layout-test-utils';
import InlineCard from '../InlineCard';

const COMPANY_JSON =
  '{"kind":"company","name":"Acme GmbH","industry":"Cybersecurity","location":"Berlin","size":"51-200","url":"https://acme.example"}';
const TALENT_JSON =
  '{"kind":"talent","name":"Jane Doe","title":"Security Engineer","current_company":"Acme GmbH","location":"Berlin","linkedin_url":"https://www.linkedin.com/in/janedoe"}';
const COMPANY_WITH_SIGNAL_JSON =
  '{"kind":"company","name":"Acme GmbH","signal":"Raised $125M Series C"}';
const TALENT_WITH_SIGNAL_JSON = '{"kind":"talent","name":"Jane Doe","signal":"Open to new roles"}';

describe('InlineCard', () => {
  it('renders a CompanyCard for a valid company body', () => {
    render(<InlineCard>{COMPANY_JSON}</InlineCard>);
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument();
    expect(screen.getByText('Cybersecurity · Berlin')).toBeInTheDocument();
    expect(screen.getByText('51-200')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://acme.example');
  });

  it('renders a TalentCard for a valid talent body', () => {
    render(<InlineCard>{TALENT_JSON}</InlineCard>);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Security Engineer · Acme GmbH · Berlin')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://www.linkedin.com/in/janedoe');
  });

  it('joins string chunks when children is an array (rehype text splitting)', () => {
    const chunks = ['{"kind":"talent",', '"name":"Jane Doe"}'];
    render(<InlineCard>{chunks}</InlineCard>);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders nothing for malformed JSON (never the raw body)', () => {
    const { container } = render(<InlineCard>{'{"kind":"company","name":'}</InlineCard>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a mid-stream partial body', () => {
    const { container } = render(<InlineCard>{'{"kind":"comp'}</InlineCard>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for non-string children', () => {
    const { container } = render(
      <InlineCard>
        <span>{COMPANY_JSON}</span>
      </InlineCard>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the folded signal as a muted line under a company card', () => {
    render(<InlineCard>{COMPANY_WITH_SIGNAL_JSON}</InlineCard>);
    expect(screen.getByText('Raised $125M Series C')).toBeInTheDocument();
  });

  it('renders the folded signal as a muted line under a talent card', () => {
    render(<InlineCard>{TALENT_WITH_SIGNAL_JSON}</InlineCard>);
    expect(screen.getByText('Open to new roles')).toBeInTheDocument();
  });

  it('omits the muted line when there is no signal or summary', () => {
    render(<InlineCard>{COMPANY_JSON}</InlineCard>);
    expect(screen.queryByText(/raised|series|hiring|open to/i)).not.toBeInTheDocument();
  });
});
