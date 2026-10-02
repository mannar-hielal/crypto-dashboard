import { useSignInToTrade } from '@/hooks/useSignIn';
import { color } from '@/lib/tokens';

/**
 * The order form's answer to a signed-out submit — reachable only if the sign-in lock was stripped
 * in DevTools (no request was sent). Its own component: it needs the router, the form doesn't.
 */
export function SignInToTradeLink() {
  const signIn = useSignInToTrade();
  return (
    <>
      Paper trading needs a free account.{' '}
      <button
        type="button"
        onClick={signIn}
        className="font-semibold underline underline-offset-2"
        style={{ color: color.white }}
      >
        Sign in to trade
      </button>
    </>
  );
}
