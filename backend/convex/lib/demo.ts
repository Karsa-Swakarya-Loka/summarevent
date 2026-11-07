/**
 * The demo switch. Demo-only routes and data (demo sign-in, reset, simulated buyers, the shared demo password, the
 * on-screen OTP and simulated payments) are on only where the deployment says so with `DEMO_MODE=true`. Anything else,
 * including an unset variable, keeps them off, so a deployment that forgets the setting is safe rather than open.
 */
export const demoEnabled = (): boolean => process.env.DEMO_MODE === 'true'
