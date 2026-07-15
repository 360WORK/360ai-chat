import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';
import { stripOnboardingMarkers } from '~/components/Onboarding/onboardingSchema';
import { stripConfirmMarkers } from '~/components/Acumen/confirmSchema';
import { extractSignalCard, stripSignalCardMarkers } from '~/components/Signals/signalCardSchema';
import SignalCard from '~/components/Signals/SignalCard';

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

type ContentType =
  | ReactElement<React.ComponentProps<typeof Markdown>>
  | ReactElement<React.ComponentProps<typeof MarkdownLite>>
  | ReactElement;

const TextPart = memo(function TextPart({ text, isCreatedByUser, showCursor }: TextPartProps) {
  const { isSubmitting = false, isLatestMessage = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      // Hide the agent's onboarding markers (step-id comment + inline spec),
      // acumen-confirm blocks, and signal-card blocks from the transcript. The
      // pill UI and confirm dock read the first two; the signal briefing is
      // rendered as a card below the prose.
      const cleanText = stripSignalCardMarkers(stripConfirmMarkers(stripOnboardingMarkers(text)));
      const signalCard = extractSignalCard(text);
      return (
        <>
          <Markdown content={cleanText} isLatestMessage={isLatestMessage} />
          {signalCard && <SignalCard card={signalCard} />}
        </>
      );
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={text} />;
    } else {
      return <>{text}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, text, isLatestMessage]);

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!text.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
      )}
    >
      {content}
    </div>
  );
});
TextPart.displayName = 'TextPart';

export default TextPart;
