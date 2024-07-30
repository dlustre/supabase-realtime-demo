import { YStack, Theme } from 'tamagui';

type ScreenContentProps = {
  children?: React.ReactNode;
};

export const ScreenContent = ({ children }: ScreenContentProps) => {
  return (
    <Theme name="light">
      <YStack flex={1} alignItems="center" justifyContent="center">
        {children}
      </YStack>
    </Theme>
  );
};
