import { memo } from 'react';
import type { TConversation } from 'librechat-data-provider';
import { areConversationIconFieldsEqual } from './utils';

type EndpointIconContext = 'message' | 'nav' | 'landing' | 'menu-item';

type ConversationEndpointIconProps = {
  conversation: TConversation;
  className?: string;
  context?: EndpointIconContext;
  size?: number;
};

function ConversationEndpointIcon({ className, size = 20 }: ConversationEndpointIconProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex flex-shrink-0 items-center justify-center overflow-hidden ${className ?? ''}`}
    >
      <img
        src="assets/360-mark.png?v=guru1"
        alt="360AI"
        className="h-full w-full object-contain dark:invert"
      />
    </div>
  );
}

export default memo(ConversationEndpointIcon, (prevProps, nextProps) => {
  return (
    prevProps.className === nextProps.className &&
    prevProps.context === nextProps.context &&
    prevProps.size === nextProps.size &&
    areConversationIconFieldsEqual(prevProps.conversation, nextProps.conversation)
  );
});
