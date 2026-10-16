import { useState } from "react";
import { toast } from "sonner";
import { authApi } from "../api/account";
import type { Settings } from "../api/types";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useAuth } from "../context/auth-provider";
import { useThemePreference } from "../context/theme-sync";
import { cn } from "../lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

const unitOptions: Option<Settings["units"]>[] = [
  { value: "metric", label: "Metric", hint: "°C, m/s" },
  { value: "imperial", label: "Imperial", hint: "°F, mph" },
];
const themeOptions: Option<Settings["theme"]>[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];
const languageOptions: Option<Settings["language"]>[] = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

export default function SettingsPage() {
  const { status, user, settings, updateSettings } = useAuth();
  const [resent, setResent] = useState(false);

  const resendVerification = async () => {
    try {
      await authApi.resendVerification();
      setResent(true);
    } catch {
      toast.error("Could not send the email, please try again later");
    }
  };
  const { theme, setTheme } = useThemePreference();

  const save = (patch: Partial<Settings>) =>
    updateSettings(patch).catch(() => toast.error("Could not save your settings"));

  return (
    <Card className="mx-auto mt-8 max-w-xl">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          {status === "signed-in"
            ? "Saved to your account and used on all your devices."
            : "Saved on this device. Sign in to use them everywhere."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {user && (
          <section className="space-y-1 rounded-md border p-3 text-sm">
            <p>
              Signed in as <b>{user.email}</b>
            </p>
            {user.emailVerified ? (
              <p className="text-muted-foreground">Email confirmed.</p>
            ) : resent ? (
              <p className="text-muted-foreground">Check your inbox for the confirmation link.</p>
            ) : (
              <p className="text-muted-foreground">
                Email not confirmed yet.{" "}
                <Button variant="link" className="h-auto p-0" onClick={resendVerification}>
                  Send the link again
                </Button>
              </p>
            )}
          </section>
        )}
        <Choice
          label="Units"
          options={unitOptions}
          value={settings.units}
          onChange={(units) => save({ units })}
        />
        <Choice label="Theme" options={themeOptions} value={theme} onChange={setTheme} />
        <Choice
          label="Language"
          description="Translations arrive in a later version; your choice is kept."
          options={languageOptions}
          value={settings.language}
          onChange={(language) => save({ language })}
        />
      </CardContent>
    </Card>
  );
}

function Choice<T extends string>({
  label,
  description,
  options,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              variant={selected ? "default" : "outline"}
              className={cn("min-w-24", selected && "pointer-events-none")}
              onClick={() => onChange(option.value)}
            >
              {option.label}
              {option.hint && <span className="text-xs opacity-70">{option.hint}</span>}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
