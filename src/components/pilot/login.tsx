import { UtensilsCrossed } from 'lucide-react';
import LoginForm from './login-form';
import { Geist } from 'next/font/google';
import styles from './pilot.module.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export default function PilotLogin({error=""}:{error?:string}) {
 return <main className={`${styles.page} ${styles.loginPage} ${geist.variable}`} data-pilot-login><section className={styles.loginCard}>
  <div className={styles.loginBrand}>
   <span aria-hidden="true"><UtensilsCrossed size={27}/></span>
   <p>MO BISTRO</p>
  </div>
  <h1>Reception Sign in</h1>
  <LoginForm>
   <label>Username<input required name="username" maxLength={32} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Your username"/></label>
   <label>Password<input required name="credential" maxLength={256} type="password" autoComplete="current-password" placeholder="Enter your password"/></label>
   {error&&<p role="alert" className={styles.notice}>{error}</p>}
  </LoginForm>
 </section></main>;
}
