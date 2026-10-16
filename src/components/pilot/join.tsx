"use client";
import {useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,ArrowUpRight,Check,ChevronDown,Camera,MapPin,Users,UtensilsCrossed} from 'lucide-react';
type Seating='indoor'|'outdoor';
function isValidFullName(value:string){return value.trim().length>=2;}
export default function PilotJoin(){
 const router=useRouter(),pending=useRef(false);
 const [name,setName]=useState(''),[nameTouched,setNameTouched]=useState(false),[phone,setPhone]=useState('');
 const [partySize,setPartySize]=useState(2),[seatingPreference,setSeatingPreference]=useState<Seating>('indoor');
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 async function joinWaitlist(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;setNameTouched(true);
  if(!isValidFullName(name)){setError('Please enter your name.');return;}
  pending.current=true;setLoading(true);setError('');
  try{
   const response=await fetch('/api/pilot/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim(),phone:phone.trim(),party_size:partySize,preference:seatingPreference,whatsapp_consent:false})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to join the waitlist.');
   if(typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))throw Error('Please ask reception for your booking status.');
   router.push('/status?token='+encodeURIComponent(data.token));
  }catch(e){setError(e instanceof Error?e.message:'Unable to join the waitlist.');pending.current=false;setLoading(false);}
 }
  const inputClass =
    "w-full rounded-xl border border-[#E4DCD0] bg-[#FFFDF9] px-4 py-3.5 text-[15px] text-[#302D28] outline-none transition placeholder:text-[#A69F95] focus:border-[#AD8A5B] focus:ring-2 focus:ring-[#AD8A5B]/15";

  return (
    <main className="min-h-screen bg-[#F4F0E9] text-[#302D28]">
      <div className="mx-auto min-h-screen max-w-[1160px] lg:flex lg:items-center lg:px-6 lg:py-8">
        <div className="grid min-h-screen w-full overflow-hidden bg-[#FFFCF7] shadow-[0_16px_65px_rgba(42,35,25,0.08)] lg:min-h-[750px] lg:grid-cols-[0.9fr_1.1fr] lg:rounded-[28px]">

          {/* Restaurant introduction */}
          <section className="relative flex min-h-[260px] flex-col justify-between overflow-hidden bg-[#34382E] px-7 py-7 text-[#F9F4E9] sm:px-10 lg:min-h-full lg:px-12 lg:py-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-32 -top-24 h-80 w-80 rounded-full border border-[#D7C49E]/15"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-12 h-60 w-60 rounded-full border border-[#D7C49E]/20"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-48 -left-24 h-96 w-96 rounded-full border border-[#D7C49E]/15"
            />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D9C29C]">
                  <UtensilsCrossed size={15} strokeWidth={1.5} />
                  <span>Mo Bistro</span>
                </div>
                <div className="mt-3 font-serif text-[31px] tracking-[-0.04em] sm:text-[36px]">
                  mo bistro<span className="text-[#D6B681]">.</span>
                </div>
              </div>

              <span className="rounded-full border border-[#D8C9AA]/25 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#E1D5BD]">
                District 5
              </span>
            </div>

            <div className="relative z-10 mt-10 lg:my-auto lg:py-14">
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#D6B681]">
                A little time, well spent
              </p>

              <h1 className="max-w-[420px] font-serif text-[43px] leading-[1.08] tracking-[-0.04em] sm:text-[54px] lg:text-[62px]">
                Good things
                <br />
                are worth
                <br />
                <em className="font-normal text-[#D6B681]">waiting for.</em>
              </h1>

              <p className="mt-5 max-w-[330px] text-[14px] leading-7 text-[#E0DDCF]/80">
                We&apos;re happy you&apos;re here. Leave us your details
                and we&apos;ll help you find your place at the table.
              </p>
            </div>

            <div className="relative z-10 mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[#F5EBD5]/15 pt-5 text-[12px] text-[#E0D8C7]">
              <span className="flex items-center gap-2">
                <MapPin size={15} className="text-[#D6B681]" />
                District 5, New Cairo
              </span>
              <a
                href="https://www.instagram.com/mobistroegypt/?hl=en"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 transition hover:text-white"
              >
                <Camera size={15} />
                Follow us
                <ArrowUpRight size={13} />
              </a>
            </div>
          </section>

          {/* Booking form */}
          <section className="flex flex-col justify-center px-6 py-9 sm:px-12 sm:py-12 lg:px-14 xl:px-20">
            <div className="mx-auto w-full max-w-[440px]">
              <div className="mb-8">
                <div className="mb-4 flex items-center gap-2">
                  <span className="h-[1px] w-8 bg-[#B99766]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#A17E4E]">
                    Welcome to Mo Bistro
                  </span>
                </div>

                <h2 className="font-serif text-[39px] leading-tight tracking-[-0.035em] text-[#2C3028] sm:text-[45px]">
                  Join our waitlist
                </h2>
                <p className="mt-3 text-[14px] leading-6 text-[#807B71]">
                  Just a few details and we&apos;ll take care of the rest.
                </p>
              </div>

              <form onSubmit={joinWaitlist} className="space-y-5" aria-busy={loading}>
                <div>
                  <label
                    htmlFor="guest-name"
                    className="mb-2 block text-[12px] font-semibold text-[#504B42]"
                  >
                    Your name
                  </label>
                  <input
                    id="guest-name"
                    required
                    autoComplete="name"
                    maxLength={100}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={() => setNameTouched(true)}
                    aria-invalid={nameTouched && !isValidFullName(name)}
                    placeholder="Full name"
                    className={inputClass}
                  />
                  {nameTouched && !isValidFullName(name) && (
                    <p role="alert" className="mt-2 text-sm text-red-600">
                      Please enter your name.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="guest-phone"
                    className="mb-2 block text-[12px] font-semibold text-[#504B42]"
                  >
                    Phone number
                  </label>
                  <input
                    id="guest-phone"
                    required
                    type="tel"
                    pattern="01[0125][0-9]{8}"
                    maxLength={11}
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="party-size"
                      className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#504B42]"
                    >
                      <Users size={14} />
                      Guests
                    </label>
                    <div className="relative">
                      <select
                        id="party-size"
                        value={partySize}
                        onChange={e => setPartySize(Number(e.target.value))}
                        className={`${inputClass} appearance-none pr-9`}
                      >
                        {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>
                            {n} {n === 1 ? "guest" : "guests"}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#817A6C]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="seating"
                      className="mb-2 block text-[12px] font-semibold text-[#504B42]"
                    >
                      Seating preference
                    </label>
                    <div className="relative">
                      <select
                        id="seating"
                        value={seatingPreference}
                        onChange={e => setSeatingPreference(e.target.value as Seating)}
                        className={`${inputClass} appearance-none pr-9`}
                      >
                        <option value="indoor">Indoor</option>
                        <option value="outdoor">Outdoor</option>
                      </select>
                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#817A6C]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl bg-[#F4F1E9] px-4 py-3.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E2E5D9] text-[#526347]">
                    <Check size={12} />
                  </span>
                  <p className="text-[12px] leading-5 text-[#777367]">
                    We&apos;ll use your details to manage your place in the
                    queue. Seating preferences depend on availability.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl bg-[#34382E] px-5 py-4 text-[14px] font-semibold text-[#FFF9EC] transition hover:bg-[#424938] disabled:cursor-wait disabled:opacity-60"
                >
                  {loading ? "Joining the waitlist..." : "Join the waitlist"}
                  {!loading && (
                    <ArrowRight
                      size={17}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  )}
                </button>
              </form>

              <div className="mt-9 flex items-center justify-center gap-5 border-t border-[#EAE4DA] pt-6 text-[12px] text-[#777064]">

                <a
                  href="https://www.facebook.com/mobistroegypt/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-[#A17E4E]"
                >
                  Facebook <ArrowUpRight size={13} />
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
