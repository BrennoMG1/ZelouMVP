"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function RedefinirSenhaPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const prepareRecovery = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (!code) {
          setError(
            "O link de recuperação é inválido ou já foi utilizado."
          );
          setLoading(false);
          return;
        }

        const response = await fetch("/api/auth/recovery/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {

          setError(
            "O link de recuperação é inválido ou expirou. Solicite um novo link."
          );

          setLoading(false);
          return;
        }

        setLoading(false);
      } catch {
        setError(
          "Não foi possível validar o link de recuperação."
        );

        setLoading(false);
      }
    };

    prepareRecovery();
  }, []);

  const submit = async () => {
    setError("");

    if (password.length < 8) {
      setError(
        "A nova senha deve ter pelo menos 8 caracteres."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/auth/recovery/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          body?.error ?? "Não foi possível alterar sua senha. Solicite um novo link de recuperação."
        );

        return;
      }

      setSuccess(true);

      setTimeout(() => {
        router.push("/");
      }, 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f4f8f8",
          display: "grid",
          placeItems: "center",
          padding: 20,
        }}
      >
        <section
          className="panel"
          style={{
            maxWidth: 430,
            width: "100%",
            padding: 30,
            textAlign: "center",
          }}
        >
          <div
            className="logo"
            style={{ justifyContent: "center" }}
          >
            <span className="logo-mark">♡</span>

            <span>
              Zelou<span style={{ color: "#6ed6a7" }}>!</span>
            </span>
          </div>

          <h1
            className="display"
            style={{
              fontSize: 23,
              marginTop: 25,
            }}
          >
            Validando seu link...
          </h1>

          <p className="subtle">
            Aguarde enquanto verificamos sua solicitação.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f8f8",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <section
        className="panel"
        style={{
          maxWidth: 430,
          width: "100%",
          padding: 30,
        }}
      >
        <div
          className="logo"
          style={{
            justifyContent: "center",
            padding: 0,
          }}
        >
          <span className="logo-mark">♡</span>

          <span>
            Zelou<span style={{ color: "#6ed6a7" }}>!</span>
          </span>
        </div>

        {success ? (
          <>
            <h1
              className="display"
              style={{
                fontSize: 24,
                marginTop: 25,
              }}
            >
              Senha alterada!
            </h1>

            <p
              className="subtle"
              style={{
                lineHeight: 1.6,
                marginTop: 8,
              }}
            >
              Sua senha foi redefinida com sucesso.
              <br />
              Você será redirecionado para o Zelou!.
            </p>
          </>
        ) : (
          <>
            <span
              className="tag"
              style={{
                marginTop: 25,
              }}
            >
              Recuperação de acesso
            </span>

            <h1
              className="display"
              style={{
                fontSize: 24,
                margin: "15px 0 8px",
              }}
            >
              Crie uma nova senha
            </h1>

            <p
              className="subtle"
              style={{
                lineHeight: 1.6,
              }}
            >
              Escolha uma nova senha para acessar sua conta.
            </p>

            <div
              style={{
                display: "grid",
                gap: 12,
                marginTop: 22,
              }}
            >
              <label
                style={{
                  display: "grid",
                  gap: 5,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Nova senha

                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Mínimo de 8 caracteres"
                  autoComplete="new-password"
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: 11,
                  }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: 5,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Confirmar nova senha

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  placeholder="Digite novamente"
                  autoComplete="new-password"
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: 11,
                  }}
                />
              </label>

              {error && (
                <p
                  role="alert"
                  style={{
                    color: "#c45f50",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </p>
              )}

              <button
                className="primary"
                onClick={submit}
                disabled={saving}
                style={{
                  justifyContent: "center",
                  marginTop: 5,
                }}
              >
                {saving
                  ? "Salvando..."
                  : "Alterar minha senha"}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
