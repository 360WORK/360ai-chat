import { memo, useCallback, useEffect, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, buildTree, QueryKeys } from 'librechat-data-provider';
import type { TChatProject, TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import {
  useAddedResponse,
  useResumeOnLoad,
  useAdaptiveSSE,
  useChatHelpers,
  useQueueDrain,
  useLocalize,
} from '~/hooks';
import { ChatContext, AddedChatContext, ChatFormProvider, useFileMapContext } from '~/Providers';
import { AcumenWorkspaces, AcumenLensChip } from '~/components/Acumen';
import AcumenConfirmDock from '~/components/Acumen/AcumenConfirmDock';
import useCurrentConfirmFrame from '~/components/Acumen/useCurrentConfirmFrame';
import { getCurrentBranchLeaf } from '~/utils/latestAssistantText';
import { useSignalsSync } from '~/data-provider/Signals/queries';
import OnboardingStarters from '~/components/Onboarding/OnboardingStarters';
import OnboardingHero from '~/components/Onboarding/OnboardingHero';
import useOnboardingGate from '~/components/Onboarding/useOnboardingGate';
import useCurrentOnboardingStep from '~/components/Onboarding/useCurrentOnboardingStep';
import OnboardingPillDock from '~/components/Onboarding/OnboardingPillDock';
import { useGetMessagesByConvoId } from '~/data-provider';
import ProjectLandingChip from './ProjectLandingChip';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import { cn } from '~/utils';
import store from '~/store';

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function ChatView({ index = 0, project }: { index?: number; project?: TChatProject }) {
  const { conversationId } = useParams();
  const localize = useLocalize();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const fileMap = useFileMapContext();

  const {
    data: messagesTree = null,
    isLoading,
    isFetching,
  } = useGetMessagesByConvoId(
    conversationId ?? '',
    {
      select: useCallback(
        (data: TMessage[]) => {
          const dataTree = buildTree({ messages: data, fileMap });
          return dataTree?.length === 0 ? null : (dataTree ?? null);
        },
        [fileMap],
      ),
      enabled: !!conversationId && conversationId !== Constants.SEARCH,
      /** Refetch stale caches on mount: navigation invalidates (not removes)
       * messages now, so a warm conversation renders instantly from cache and
       * reconciles in the background instead of unmounting into a spinner. */
      refetchOnMount: true,
    },
    { isStreaming: isSubmitting },
  );

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job.
  // Wait for messages to load AND the warm-cache background revalidation to
  // settle: a stale invalidated cache mounts with isLoading false while the
  // refetch is in flight, and resume must not build from (or race) it.
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading && !isFetching);

  // Auto-send queued follow-up messages once a run finishes cleanly.
  useQueueDrain(index, conversationId, chatHelpers.ask);

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;
  const isProjectLandingPage = isLandingPage && project != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  const chatFormPlaceholder =
    isProjectLandingPage && project
      ? localize('com_ui_new_chat_in_project', { name: project.name })
      : undefined;

  const queryClient = useQueryClient();
  const { gateActive, isCompanyScope } = useOnboardingGate();
  const { step: activeStep } = useCurrentOnboardingStep(gateActive, messagesTree);
  const { frame: confirmFrame } = useCurrentConfirmFrame(messagesTree);
  const lastMessageId = useMemo(
    () => getCurrentBranchLeaf(messagesTree)?.messageId,
    [messagesTree],
  );
  // Periodically pull new signal-run digests into the user's "Signals"
  // conversation. Silent (no UI); the messages list refetch shows new digests.
  useSignalsSync();

  // Refetch onboarding status whenever the user lands on the new-chat page so
  // that a just-completed onboarding is reflected without a full page reload.
  useEffect(() => {
    if (isLandingPage) {
      queryClient.invalidateQueries([QueryKeys.onboardingStatus]);
    }
  }, [isLandingPage, queryClient]);

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div className="relative flex h-full w-full flex-col">
              <Header />
              <>
                {isLandingPage && gateActive ? (
                  <div className={cn('flex flex-col', 'flex-1 items-center justify-center')}>
                    <OnboardingHero isCompanyScope={isCompanyScope} />
                    {/* The form must stay mounted for form-context registration; `inert` keeps its content unfocusable (React 18 needs the string-spread form). */}
                    <div className="sr-only" aria-hidden="true" {...{ inert: '' }}>
                      <ChatForm index={index} placeholder={chatFormPlaceholder} />
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'flex flex-col',
                      isLandingPage
                        ? 'flex-1 items-center justify-end sm:justify-center'
                        : 'h-full overflow-y-auto',
                    )}
                  >
                    {isLandingPage ? <div className="w-full shrink-0">{content}</div> : content}
                    <div
                      className={cn(
                        'w-full',
                        isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
                      )}
                    >
                      {isProjectLandingPage && project && <ProjectLandingChip project={project} />}
                      {isLandingPage && <OnboardingStarters />}
                      {isLandingPage && <AcumenWorkspaces />}
                      <OnboardingPillDock step={activeStep} submitting={isSubmitting} />
                      <AcumenLensChip
                        conversationId={conversationId}
                        lastMessageId={lastMessageId}
                      />
                      <AcumenConfirmDock
                        frame={activeStep ? null : confirmFrame}
                        submitting={isSubmitting}
                      />
                      <ChatForm index={index} placeholder={chatFormPlaceholder} />
                      {!isLandingPage && <Footer />}
                    </div>
                  </div>
                )}
                {isLandingPage && !gateActive && <Footer />}
              </>
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
