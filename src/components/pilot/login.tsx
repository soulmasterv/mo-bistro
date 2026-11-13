import { UtensilsCrossed } from 'lucide-react';
import styles from './pilot.module.css';

export default function PilotLogin({error=""}:{error?:string}) {
 return <main className={styles.page} data-pilot-login><section className={`${styles.panel} ${styles.guest}`}>
  <div className={styles.loginBrand}>
   <span aria-hidden="true"><UtensilsCrossed size={27}/></span>
   <p>MO BISTRO</p>
  </div>
  <h1>Reception Sign in</h1>
  <form className={styles.form} method="post" action="/api/auth/login">
   <label>Username<input required name="username" maxLength={32} autoComplete="username" autoCapitalize="none" spellCheck={false}/></label>
   <label>Password<input required name="credential" maxLength={256} type="password" autoComplete="current-password"/></label>
   {error&&<p role="alert" className={styles.notice}>{error}</p>}
   <button className={styles.button} type="submit">Sign in</button>
  </form>
 </section></main>;
}
