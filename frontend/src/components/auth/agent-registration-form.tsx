"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Upload, Eye, EyeOff, Loader2, X, CheckCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/api";
import {
  AGENT_TERMS_VERSION,
  CITIES_BY_COUNTRY,
  COUNTRIES_MASTER,
  STATES_BY_COUNTRY,
  countryByName,
  validatePhoneDigits,
} from "@/lib/location-options";
import { stateFromGstin } from "@/lib/gst-state";
import { cn } from "@/lib/utils";
import { AgentRegistrationTermsDialog } from "@/components/auth/agent-registration-terms-dialog";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = ["image/jpeg", "image/png", "application/pdf"];

type FieldErrors = Partial<Record<
  | "fullName" | "companyName" | "address" | "email" | "phone"
  | "country" | "state" | "city" | "password" | "confirmPassword"
  | "passportNumber" | "terms" | "gstProof",
  string
>>;

export function AgentRegistrationForm({ onLogin }: { onLogin: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [countryCodeIso, setCountryCodeIso] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [panNumber, setPanNumber] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [gstProofName, setGstProofName] = useState("");
  const [gstProofSize, setGstProofSize] = useState(0);
  const [gstProofId, setGstProofId] = useState("");
  const [gstProofUploading, setGstProofUploading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const stateOptions = useMemo(() => (country ? STATES_BY_COUNTRY[country] || [] : []), [country]);
  const cityOptions = useMemo(() => (country ? CITIES_BY_COUNTRY[country] || [] : []), [country]);

  function clearError(key: keyof FieldErrors) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validateClient(): FieldErrors {
    const next: FieldErrors = {};
    if (!fullName.trim() || fullName.trim().length < 2) next.fullName = "Enter agent name";
    if (!companyName.trim() || companyName.trim().length < 2) next.companyName = "Enter company name";
    if (!address.trim() || address.trim().length < 8) next.address = "Enter a complete business address";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid agent email id";
    const phoneErr = validatePhoneDigits(countryCode, phone);
    if (phoneErr) next.phone = phoneErr;
    if (!country.trim()) next.country = "Select a country";
    if (!state.trim()) next.state = "Enter state / province";
    if (!city.trim()) next.city = "Select or enter a city";
    if (!passportNumber.trim() || passportNumber.trim().length < 5) {
      next.passportNumber = "Enter a valid passport number";
    }
    if (!password) next.password = "Password is required";
    else if (password.length < 12) next.password = "Password must be at least 12 characters";
    else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      next.password = "Use upper, lower, number and special character";
    }
    if (!confirmPassword) next.confirmPassword = "Confirm your password";
    else if (password !== confirmPassword) next.confirmPassword = "Passwords do not match";
    if (!termsAccepted) next.terms = "You must accept the Terms & Conditions";
    return next;
  }

  async function handleProofFile(file: File) {
    clearError("gstProof");
    if (file.size > MAX_PROOF_BYTES) {
      setErrors((e) => ({ ...e, gstProof: "GST / VAT proof must be under 5MB" }));
      return;
    }
    if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
      setErrors((e) => ({ ...e, gstProof: "Upload JPG, PNG, or PDF only" }));
      return;
    }
    setGstProofUploading(true);
    try {
      const uploaded = await api.uploadGstProof(file);
      setGstProofId(uploaded.gstProofId);
      setGstProofName(file.name);
      setGstProofSize(file.size);
    } catch (err) {
      setErrors((e) => ({ ...e, gstProof: err instanceof Error ? err.message : "Upload failed. Try another file." }));
    } finally {
      setGstProofUploading(false);
    }
  }

  function clearProof() {
    setGstProofId("");
    setGstProofName("");
    setGstProofSize(0);
    if (fileRef.current) fileRef.current.value = "";
    clearError("gstProof");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientErrors = validateClient();
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) {
      toast({ title: "Check the form", description: "Please fix the highlighted fields.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.registerAgent({
        fullName: fullName.trim(),
        companyName: companyName.trim(),
        address: address.trim(),
        email: email.trim().toLowerCase(),
        countryCode,
        phone: phone.replace(/\D/g, ""),
        country,
        countryCodeIso: countryCodeIso || countryByName(country)?.code,
        state: state.trim(),
        city: city.trim(),
        panNumber: panNumber.trim() || undefined,
        passportNumber: passportNumber.trim(),
        password,
        confirmPassword,
        gstNumber: gstNumber.trim() || undefined,
        gstProofId: gstProofId || undefined,
        termsAccepted: true,
        termsVersion: AGENT_TERMS_VERSION,
      });

      if (result.token) {
        // Defensive: server must not issue a session for Submitted registrations.
        toast({
          title: "Registration submitted",
          description: "Your application is pending admin approval. Please wait before signing in.",
        });
      } else {
        toast({
          title: "Registration submitted",
          description: result.message || "Your application is pending admin approval. You will be able to sign in after approval.",
        });
      }
      // Never auto-authenticate after registration (Phase 15).
      onLogin();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Registration failed. Please try again.";
      const details = err instanceof ApiError ? err.body?.details : undefined;
      if (details && typeof details === "object") {
        const mapped: FieldErrors = {};
        for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
          if (Array.isArray(v) && typeof v[0] === "string") mapped[k as keyof FieldErrors] = v[0];
        }
        if (Object.keys(mapped).length) setErrors((prev) => ({ ...prev, ...mapped }));
      }
      if (/already (exists|registered)/i.test(message)) {
        setErrors((prev) => ({ ...prev, email: "This email address is already registered. Please login instead." }));
      }
      if (/mobile number is already registered/i.test(message)) {
        setErrors((prev) => ({ ...prev, phone: "This mobile number is already registered. Please login instead." }));
      }
      toast({ title: "Registration failed", description: message, variant: "destructive" });
      setPassword("");
      setConfirmPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-y-auto bg-[#f4f8fd] text-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-80 w-80 rounded-full bg-brand-teal/20 blur-3xl" />
        <div className="absolute top-1/3 -right-8 h-40 w-40 rounded-full bg-brand-blue/10 blur-2xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/trevio-logo.png" alt="Trevio Global" className="h-8 w-auto shrink-0" />
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-blue/10 border border-brand-blue/20 text-[11px] font-semibold tracking-wide text-brand-blue">
              <span className="w-2 h-2 rounded-full bg-brand-teal shrink-0" aria-hidden />
              NEW AGENT REGISTRATION
            </div>
          </div>
          <Button
            type="button"
            onClick={onLogin}
            variant="outline"
            className="border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900 px-6 rounded-xl shadow-sm"
          >
            Login
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold leading-[1.15] tracking-tight text-slate-900">
            <span className="block">Create Your</span>
            <span className="block bg-gradient-to-r from-brand-blue to-brand-teal bg-clip-text text-transparent">
              Agent Account!
            </span>
          </h1>
          <p className="text-slate-500 mt-3 max-w-2xl text-sm sm:text-base">
            Fill in your details below to register with Trevio Global. An administrator must approve your account before you can sign in.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-[1.75rem] bg-white border border-slate-200/80 shadow-[0_24px_60px_-20px_rgba(15,40,80,0.18)] p-5 sm:p-8 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Agent Name" required error={errors.fullName}>
              <Input
                autoComplete="name"
                placeholder="Enter agent name"
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }}
                aria-invalid={Boolean(errors.fullName)}
              />
            </Field>
            <Field label="Company Name" required error={errors.companyName}>
              <Input
                autoComplete="organization"
                placeholder="Enter company name"
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                value={companyName}
                onChange={(e) => { setCompanyName(e.target.value); clearError("companyName"); }}
                aria-invalid={Boolean(errors.companyName)}
              />
            </Field>
          </div>

          <Field label="Address" required error={errors.address}>
            <Textarea
              autoComplete="street-address"
              placeholder="Enter business address"
              rows={3}
              className="rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
              value={address}
              onChange={(e) => { setAddress(e.target.value); clearError("address"); }}
              aria-invalid={Boolean(errors.address)}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Agent Email Id" required error={errors.email}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="Enter agent email id"
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                aria-invalid={Boolean(errors.email)}
              />
            </Field>
            <Field label="Mobile Number" required error={errors.phone}>
              <div className="flex gap-2">
                <Select
                  value={countryCode}
                  onValueChange={(v) => { setCountryCode(v); clearError("phone"); }}
                >
                  <SelectTrigger className="w-[108px] shrink-0 h-11 rounded-xl border-slate-200" aria-label="Country calling code">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES_MASTER.map((c) => (
                      <SelectItem key={c.dialCode + c.code} value={c.dialCode}>
                        {c.flag} {c.dialCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1 h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="Enter mobile number"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "")); clearError("phone"); }}
                  aria-invalid={Boolean(errors.phone)}
                />
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Country" required error={errors.country}>
              <Select
                value={country}
                onValueChange={(v) => {
                  const meta = countryByName(v);
                  setCountry(v);
                  setCountryCodeIso(meta?.code || "");
                  if (meta?.dialCode) setCountryCode(meta.dialCode);
                  setState("");
                  setCity("");
                  clearError("country");
                  clearError("state");
                  clearError("city");
                }}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200" aria-invalid={Boolean(errors.country)}>
                  <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES_MASTER.map((c) => (
                    <SelectItem key={c.code} value={c.name}>{c.flag} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="State/Province" required error={errors.state}>
              {stateOptions.length > 0 ? (
                <Select value={state} onValueChange={(v) => { setState(v); clearError("state"); }}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200" aria-invalid={Boolean(errors.state)}>
                    <SelectValue placeholder="State/Province" />
                  </SelectTrigger>
                  <SelectContent>
                    {stateOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="State/Province"
                  className="h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                  value={state}
                  onChange={(e) => { setState(e.target.value); clearError("state"); }}
                  aria-invalid={Boolean(errors.state)}
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="City" required error={errors.city}>
              {cityOptions.length > 0 ? (
                <Popover open={cityOpen} onOpenChange={setCityOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={cityOpen}
                      className={cn(
                        "w-full justify-between font-normal h-11 rounded-xl border-slate-200",
                        !city && "text-muted-foreground",
                        errors.city && "border-destructive",
                      )}
                    >
                      <span className="truncate">{city || "Search to select city"}</span>
                      <Search className="w-3.5 h-3.5 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search city…" />
                      <CommandList>
                        <CommandEmpty>No city found. You can type a custom city below.</CommandEmpty>
                        <CommandGroup>
                          {cityOptions.map((c) => (
                            <CommandItem
                              key={c}
                              value={c}
                              onSelect={() => {
                                setCity(c);
                                setCityOpen(false);
                                clearError("city");
                              }}
                            >
                              {c}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                    <div className="border-t p-2">
                      <Input
                        placeholder="Or type city name"
                        value={city}
                        onChange={(e) => { setCity(e.target.value); clearError("city"); }}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Input
                  placeholder="Search to select city"
                  className="h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                  value={city}
                  onChange={(e) => { setCity(e.target.value); clearError("city"); }}
                  aria-invalid={Boolean(errors.city)}
                />
              )}
            </Field>
            <Field label="Passport Number" required error={errors.passportNumber}>
              <Input
                placeholder="Enter passport number"
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                value={passportNumber}
                onChange={(e) => { setPassportNumber(e.target.value); clearError("passportNumber"); }}
                autoComplete="off"
                aria-invalid={Boolean(errors.passportNumber)}
              />
            </Field>
            <Field label="PAN / Tax No.">
              <Input
                placeholder="PAN / Tax No."
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Password" required error={errors.password}>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="h-11 rounded-xl border-slate-200 pr-10 focus-visible:ring-brand-blue/30"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError("password"); clearError("confirmPassword"); }}
                  aria-invalid={Boolean(errors.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Min 12 chars, upper, lower, number & special character</p>
            </Field>
            <Field label="Confirm Password" required error={errors.confirmPassword}>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  className="h-11 rounded-xl border-slate-200 pr-10 focus-visible:ring-brand-blue/30"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); clearError("confirmPassword"); }}
                  aria-invalid={Boolean(errors.confirmPassword)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="GST / VAT No.">
              <Input
                placeholder="GST / VAT No."
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-brand-blue/30"
                value={gstNumber}
                onChange={(e) => {
                  const next = e.target.value;
                  const derived = stateFromGstin(next);
                  setGstNumber(next);
                  if (derived && country === "India" && !state) setState(derived);
                }}
                autoComplete="off"
              />
            </Field>
            <Field label="GST / VAT Proof" error={errors.gstProof}>
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleProofFile(file);
                }}
              />
              {!gstProofName ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={gstProofUploading}
                  className={cn(
                    "w-full rounded-xl border-2 border-dashed border-slate-200 p-6 text-center transition hover:border-brand-blue/40 hover:bg-brand-blue/5",
                    errors.gstProof && "border-destructive/50",
                  )}
                >
                  {gstProofUploading ? (
                    <Loader2 className="w-7 h-7 mx-auto text-brand-teal mb-2 animate-spin" />
                  ) : (
                    <Upload className="w-7 h-7 mx-auto text-brand-blue/70 mb-2" />
                  )}
                  <p className="text-sm font-medium text-slate-800">Click to upload GST / VAT Proof</p>
                  <p className="text-xs text-slate-500 mt-1">JPG, PNG or PDF • Max 5MB</p>
                </button>
              ) : (
                <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 px-3 py-3 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-teal shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate text-slate-800">{gstProofName}</p>
                    <p className="text-xs text-slate-500">{(gstProofSize / 1024).toFixed(0)} KB · Ready</p>
                    <div className="flex gap-2 mt-2">
                      <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg" onClick={() => fileRef.current?.click()}>
                        Replace
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg" onClick={clearProof}>
                        <X className="w-3.5 h-3.5 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Field>
          </div>

          <div className="pt-1">
            <div className="flex items-start gap-3">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(v) => { setTermsAccepted(v === true); clearError("terms"); }}
                aria-invalid={Boolean(errors.terms)}
              />
              <label htmlFor="terms" className="text-sm text-slate-600 leading-relaxed cursor-pointer">
                I agree to the{" "}
                <button
                  type="button"
                  className="font-semibold text-brand-blue underline-offset-2 hover:underline"
                  onClick={(ev) => { ev.preventDefault(); setTermsOpen(true); }}
                >
                  Terms & Conditions
                </button>{" "}
                and confirm that the provided business details are correct.
              </label>
            </div>
            {errors.terms && <p className="text-xs text-destructive mt-1.5 ml-7" role="alert">{errors.terms}</p>}
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-brand-blue to-brand-teal text-white hover:opacity-95 shadow-lg shadow-brand-blue/20"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating account...
              </span>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>
      </div>

      <AgentRegistrationTermsDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </div>
  );
}

function Field({
  label, required, error, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-slate-800">
        {label}
        {required && <span className="text-rose-500 ml-0.5" aria-hidden>*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
