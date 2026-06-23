import { memo, useCallback, useEffect } from 'react';
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
  useLocalize,
} from '~/hooks';
import { ChatContext, AddedChatContext, ChatFormProvider, useFileMapContext } from '~/Providers';
import { AcumenWorkspaces } from '~/components/Acumen';
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

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(
    conversationId ?? '',
    {
      select: useCallback(
        (data: TMessage[]) => {
          const dataTree = buildTree({ messages: data, fileMap });
          return dataTree?.length === 0 ? null : (dataTree ?? null);
        },
        [fileMap],
      ),
      enabled: !!fileMap,
    },
    { isStreaming: isSubmitting },
  );

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job
  // Wait for messages to load before resuming to avoid race condition
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading);

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
                    <div className="sr-only" aria-hidden="true">
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
                    {content}
                    <div
                      className={cn(
                        'w-full',
                        isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
                      )}
                    >
                      {isProjectLandingPage && project && <ProjectLandingChip project={project} />}
                      {isLandingPage && <AcumenWorkspaces />}
                      {isLandingPage && <OnboardingStarters />}
                      <OnboardingPillDock step={activeStep} submitting={isSubmitting} />
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
