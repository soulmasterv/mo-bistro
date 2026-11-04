import styles from './pilot.module.css';

export default function PilotLogin({error=""}:{error?:string}) {
 return <main className={styles.page} data-pilot-login><section className={`${styles.panel} ${styles.guest}`}>
  <p className={styles.brand}>Mo Bistro - District 5</p><h1>Reception login</h1><p className={styles.hint}>Sign in with the shared staff account.</p>
  <form className={styles.form} method="post" action="/api/auth/login">
   <label>Username<input required name="username" maxLength={32} autoComplete="username" autoCapitalize="none" spellCheck={false}/></label>
   <label>Password<input required name="credential" maxLength={256} type="password" autoComplete="current-password"/></label>
   {error&&<p role="alert" className={styles.notice}>{error}</p>}
   <button className={styles.button} type="submit">Sign in</button>
  </form>
 </section></main>;
}
