"use client";
import PartyForm from './party-form';
import { useRouter } from 'next/navigation';
import styles from './pilot.module.css';
export default function PilotJoin(){const router=useRouter();return <main className={styles.page}><section className={`${styles.panel} ${styles.guest}`}>
 <p className={styles.brand}>Mo Bistro - District 5</p><h1>Join the waiting list</h1><p className={styles.hint}>Leave your details and follow your place in the queue.</p>
 <PartyForm onCreated={party=>router.push('/status?token='+encodeURIComponent(party.token))}/>
</section></main>;}
