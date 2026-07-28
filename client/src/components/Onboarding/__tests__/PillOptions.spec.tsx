import React from 'react';
import { render, screen, fireEvent } from 'test/layout-test-utils';
import PillOptions from '../PillOptions';
import { getOnboardingStep } from '../onboardingSchema';
import type { OnboardingStep } from '../onboardingSchema';

describe('PillOptions', () => {
  it('renders the prompt and all options for a single-select step', () => {
    const step = getOnboardingStep('business_type')!;
    render(<PillOptions step={step} onSubmit={jest.fn()} />);
    expect(screen.getByText('What kind of business are you?')).toBeInTheDocument();
    expect(screen.getByText('Recruitment Agency')).toBeInTheDocument();
    expect(screen.getByText('Enterprise Talent')).toBeInTheDocument();
  });

  it('never renders Continue for a single-select step', () => {
    const step = getOnboardingStep('business_type')!;
    render(<PillOptions step={step} onSubmit={jest.fn()} />);
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });

  it('auto-submits the formatted text on a single-select pick', () => {
    const onSubmit = jest.fn();
    const step = getOnboardingStep('business_type')!;
    render(<PillOptions step={step} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Recruitment Agency'));
    expect(onSubmit).toHaveBeenCalledWith('Recruitment Agency');
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });

  it('does not auto-submit again when a single-select pill is toggled off', () => {
    const onSubmit = jest.fn();
    const step = getOnboardingStep('business_type')!;
    render(<PillOptions step={step} onSubmit={onSubmit} />);
    const pill = screen.getByText('Recruitment Agency');
    fireEvent.click(pill);
    fireEvent.click(pill);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('suppresses auto-submit and disables pills while submitting', () => {
    const onSubmit = jest.fn();
    const step = getOnboardingStep('business_type')!;
    render(<PillOptions step={step} onSubmit={onSubmit} submitting={true} />);
    const pill = screen.getByText('Recruitment Agency');
    expect(pill).toBeDisabled();
    fireEvent.click(pill);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows multiple selections in a multi-select group and submits them comma-joined', () => {
    const onSubmit = jest.fn();
    const step = getOnboardingStep('recruitment_agency.recruits')!;
    render(<PillOptions step={step} onSubmit={onSubmit} />);
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Tech'));
    fireEvent.click(screen.getByText('Finance'));
    fireEvent.click(screen.getByText('Continue'));
    expect(onSubmit).toHaveBeenCalledWith('Tech, Finance');
  });

  it('renders sub-labels for compound steps and requires every group', () => {
    const step = getOnboardingStep('recruitment_agency.placement')!;
    render(<PillOptions step={step} onSubmit={jest.fn()} />);
    expect(screen.getByText('Seniority')).toBeInTheDocument();
    expect(screen.getByText('Region')).toBeInTheDocument();
    // Only seniority selected — region missing → Continue stays hidden.
    fireEvent.click(screen.getByText('Senior'));
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('UK & Ireland'));
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  it('formats a compound submission as "Label: values; Label: values"', () => {
    const onSubmit = jest.fn();
    const step = getOnboardingStep('recruitment_agency.placement')!;
    render(<PillOptions step={step} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Senior'));
    fireEvent.click(screen.getByText('UK & Ireland'));
    fireEvent.click(screen.getByText('Continue'));
    expect(onSubmit).toHaveBeenCalledWith('Seniority: Senior; Region: UK & Ireland');
  });

  it('lets the user add a custom option via "+ add your own"', () => {
    const onSubmit = jest.fn();
    const step = getOnboardingStep('recruitment_agency.recruits')!;
    render(<PillOptions step={step} onSubmit={onSubmit} />);
    const input = screen.getByPlaceholderText('+ add your own');
    fireEvent.change(input, { target: { value: 'Maritime' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Custom pill should appear, selected.
    expect(screen.getByText('Maritime')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continue'));
    expect(onSubmit).toHaveBeenCalledWith('Maritime');
  });

  it('resets the selection when the step changes', () => {
    const { rerender } = render(
      <PillOptions step={getOnboardingStep('recruitment_agency.recruits')!} onSubmit={jest.fn()} />,
    );
    fireEvent.click(screen.getByText('Tech'));
    expect(screen.getByText('Continue')).toBeInTheDocument();
    rerender(
      <PillOptions step={getOnboardingStep('in_house_ta.hire_for')!} onSubmit={jest.fn()} />,
    );
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });

  it('resets the selection between two consecutive inline (dynamic) steps', () => {
    // Bug A guard: two dynamic questions share the synthesised id 'inline',
    // so the reset must key on the prompt too — otherwise the selection from
    // the first question leaks into the second.
    const stepOne: OnboardingStep = {
      id: 'inline',
      prompt: 'Dynamic question one',
      groups: [
        { id: 'value', label: null, multi: true, options: [{ value: 'a', label: 'Alpha' }] },
      ],
    };
    const stepTwo: OnboardingStep = {
      id: 'inline',
      prompt: 'Dynamic question two',
      groups: [
        { id: 'value', label: null, multi: true, options: [{ value: 'b', label: 'Bravo' }] },
      ],
    };
    const { rerender } = render(<PillOptions step={stepOne} onSubmit={jest.fn()} />);
    fireEvent.click(screen.getByText('Alpha'));
    expect(screen.getByText('Continue')).toBeInTheDocument();
    rerender(<PillOptions step={stepTwo} onSubmit={jest.fn()} />);
    // New question → selection cleared → Continue hidden until Bravo is picked.
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });
});
