// ==============================================================================
// ⚡ MySTRA UNIFIED AUTHENTICATION ENGINE
// ==============================================================================

const SUPABASE_URL = "https://lpovahpueihltaclwzzy.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwb3ZhaHB1ZWlobHRhY2x3enp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MDI0NjgsImV4cCI6MjEwMjQ3ODQ2OH0.TtSAsdEhn5ZOLiqEsLcXxB5RoPn2XIv6hd4l6v906sU";
const EMAILJS_PUBLIC_KEY = "UEZfL0Wy1O7IHQh89";
const EMAILJS_SERVICE_ID = "service_skz401b";
const EMAILJS_TEMPLATE_ID = "template_obq7co9";

function getSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
  }
  return null;
}

// Helper function to validate password security criteria directly
function checkPasswordStrength(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(password)
  );
}

document.addEventListener("DOMContentLoaded", () => {

  if (window.emailjs) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  // DOM Elements
  const passwordInput = document.getElementById("reg-password");
  const confirmInput = document.getElementById("reg-confirm-password");
  const criteriaBox = document.getElementById("password-criteria-box");
  const confirmError = document.getElementById("confirm-password-error");

  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");
  const otpForm = document.getElementById("otp-form");

  const legacyMigrateForm = document.getElementById("legacy-migrate-form");
  const legacyOtpForm = document.getElementById("legacy-otp-form");
  const legacyPasswordForm = document.getElementById("legacy-password-form");

  const stepMigrateCreds = document.getElementById("step-migrate-credentials");
  const stepMigrateOtp = document.getElementById("step-migrate-otp");
  const stepMigratePass = document.getElementById("step-migrate-password");
  const resendLegacyBtn = document.getElementById("link-resend-legacy-otp");

  const stepRegister = document.getElementById("step-register");
  const stepOtp = document.getElementById("step-otp");
  const resendBtn = document.getElementById("link-resend-otp");

  // Reset Password DOM Elements
  const stepForgotReq = document.getElementById("step-forgot-request");
  const stepForgotOtp = document.getElementById("step-forgot-otp");
  const stepForgotPass = document.getElementById("step-forgot-password");

  const forgotReqForm = document.getElementById("forgot-request-form");
  const forgotOtpForm = document.getElementById("forgot-otp-form");
  const resetForm = document.getElementById("reset-password-form");

  const resetPassInput = document.getElementById("reset-password");
  const resetConfirmInput = document.getElementById("reset-confirm-password");
  const resendForgotBtn = document.getElementById("link-resend-forgot-otp");

  let tempUserData = { email: "", password: "", fullName: "", phone: "" };
  let tempLegacyData = { email: "", licenseNo: "", ssm: "", fullName: "", businessName: "", phone: "", documentUrl: "" };
  let recoveryEmail = "";
  let currentGeneratedOTP = null;

  // Eye Toggle Helper
  function setupEyeToggle(inputId, toggleBtnId) {
    const input = document.getElementById(inputId);
    const toggleBtn = document.getElementById(toggleBtnId);
    if (input && toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const isPassword = input.getAttribute("type") === "password";
        input.setAttribute("type", isPassword ? "text" : "password");
        toggleBtn.textContent = isPassword ? "🙈" : "👁️";
      });
    }
  }

  // Bind Eye Toggles across all forms
  setupEyeToggle("reg-password", "toggle-reg-password");
  setupEyeToggle("reg-confirm-password", "toggle-reg-confirm-password");
  setupEyeToggle("password", "toggle-login-password");
  setupEyeToggle("mig-password", "toggle-mig-password");
  setupEyeToggle("mig-confirm-password", "toggle-mig-confirm-password");
  setupEyeToggle("reset-password", "toggle-reset-password");
  setupEyeToggle("reset-confirm-password", "toggle-reset-confirm-password");

  // 6-Digit OTP Box Auto-Advance Logic
  function setupOtpInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = container.querySelectorAll(".otp-digit");

    inputs.forEach((input, index) => {
      input.addEventListener("input", (e) => {
        if (e.target.value.length === 1 && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && index > 0) {
          inputs[index - 1].focus();
        }
      });
    });
  }
  setupOtpInputs("legacy-otp-container");
  setupOtpInputs("otp-container");
  setupOtpInputs("forgot-otp-container");

  function getEnteredOtp(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return "";
    const inputs = container.querySelectorAll(".otp-digit");
    let code = "";
    inputs.forEach((inp) => (code += inp.value.trim()));
    return code;
  }

  function isPasswordSecure(pass) {
    const passLength = pass.length >= 8;
    const passUpper = /[A-Z]/.test(pass);
    const passNumber = /[0-9]/.test(pass);
    const passSpecial = /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(pass);
    return passLength && passUpper && passNumber && passSpecial;
  }

  async function sendOtpEmail(targetEmail, otpCode) {
    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: targetEmail,
      otp_code: otpCode
    });
  }

  // Registration Live Password Criteria Checker
  if (passwordInput && criteriaBox) {
    const rules = {
      length: document.getElementById("rule-length"),
      uppercase: document.getElementById("rule-uppercase"),
      number: document.getElementById("rule-number"),
      special: document.getElementById("rule-special")
    };

    function validatePassword() {
      const val = passwordInput.value;
      const checks = {
        length: val.length >= 8,
        uppercase: /[A-Z]/.test(val),
        number: /[0-9]/.test(val),
        special: /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(val)
      };

      if (rules.length) {
        rules.length.textContent = checks.length ? "✔ Minimum 8 characters long" : "❌ Minimum 8 characters long";
        rules.length.style.color = checks.length ? "green" : "red";
      }
      if (rules.uppercase) {
        rules.uppercase.textContent = checks.uppercase ? "✔ Includes at least one uppercase letter (A–Z)" : "❌ Includes at least one uppercase letter (A–Z)";
        rules.uppercase.style.color = checks.uppercase ? "green" : "red";
      }
      if (rules.number) {
        rules.number.textContent = checks.number ? "✔ Includes at least one number (0–9)" : "❌ Includes at least one number (0–9)";
        rules.number.style.color = checks.number ? "green" : "red";
      }
      if (rules.special) {
        rules.special.textContent = checks.special ? "✔ Includes at least one special character (@, #, $, etc.)" : "❌ Includes at least one special character (@, #, $, etc.)";
        rules.special.style.color = checks.special ? "green" : "red";
      }

      const allFulfilled = checks.length && checks.uppercase && checks.number && checks.special;
      if (val.length === 0 || allFulfilled) {
        criteriaBox.classList.add("hidden");
      } else {
        criteriaBox.classList.remove("hidden");
      }

      if (confirmInput && confirmInput.value.length > 0) {
        if (confirmInput.value !== passwordInput.value) {
          if (confirmError) confirmError.classList.remove("hidden");
        } else {
          if (confirmError) confirmError.classList.add("hidden");
        }
      }
    }

    passwordInput.addEventListener("focus", validatePassword);
    passwordInput.addEventListener("input", validatePassword);
    if (confirmInput) {
      confirmInput.addEventListener("input", () => {
        if (confirmInput.value !== passwordInput.value) {
          if (confirmError) confirmError.classList.remove("hidden");
        } else {
          if (confirmError) confirmError.classList.add("hidden");
        }
      });
    }
  }

  /// ==============================================================================
  // RESET PASSWORD FLOW
  // ==============================================================================

  // Helper function to handle button loading states
  function setButtonLoading(buttonEl, isLoading, loadingText = "Processing...") {
    if (!buttonEl) return;
    if (isLoading) {
      buttonEl.dataset.originalText = buttonEl.innerText || buttonEl.value;
      buttonEl.disabled = true;
      if (buttonEl.tagName === "INPUT") {
        buttonEl.value = loadingText;
      } else {
        buttonEl.innerText = loadingText;
      }
    } else {
      buttonEl.disabled = false;
      if (buttonEl.tagName === "INPUT") {
        buttonEl.value = buttonEl.dataset.originalText || "Submit";
      } else {
        buttonEl.innerText = buttonEl.dataset.originalText || "Submit";
      }
    }
  }

  // 1. STEP 1: Request Password Reset Code
  if (forgotReqForm) {
    forgotReqForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = forgotReqForm.querySelector("button[type='submit'], input[type='submit']");

      const emailInput = document.getElementById("forgot-email");
      if (!emailInput) {
        alert("❌ Error: Email input element (#forgot-email) not found in DOM.");
        return;
      }

      recoveryEmail = emailInput.value.trim().toLowerCase();

      if (!recoveryEmail) {
        alert("Please enter a valid email address.");
        return;
      }

      const client = typeof getSupabaseClient === "function" ? getSupabaseClient() : window.supabaseClient;
      if (!client) {
        alert("❌ Supabase client unavailable.");
        return;
      }

      // Disable button to prevent double triggering
      setButtonLoading(submitBtn, true, "Sending Code...");
      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();

      try {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        const { error: dbError } = await client
          .from("password_resets")
          .upsert(
            { email: recoveryEmail, otp_code: currentGeneratedOTP, expires_at: expiresAt },
            { onConflict: "email" }
          );

        if (dbError) {
          alert("❌ Failed to register reset request: " + dbError.message);
          setButtonLoading(submitBtn, false);
          return;
        }

        // Send EmailJS Asynchronously
        await sendOtpEmail(recoveryEmail, currentGeneratedOTP);

        // Immediate view transition without blocking alert collisions
        if (stepForgotReq) stepForgotReq.classList.add("hidden");
        if (stepForgotOtp) stepForgotOtp.classList.remove("hidden");
        setupOtpInputs("forgot-otp-container");

      } catch (err) {
        alert("❌ Error sending OTP email: " + (err.text || err.message));
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // 2. STEP 2: Verify OTP
  if (forgotOtpForm) {
    forgotOtpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const enteredOtp = getEnteredOtp("forgot-otp-container");

      if (enteredOtp !== currentGeneratedOTP) {
        alert("❌ Invalid verification code. Please try again.");
        return;
      }

      // Smooth step advancement
      if (stepForgotOtp) stepForgotOtp.classList.add("hidden");
      if (stepForgotPass) stepForgotPass.classList.remove("hidden");
    });
  }

  // 3. STEP 3: Live Password Validation
  if (resetPassInput && resetConfirmInput) {
    const resetRules = {
      length: document.getElementById("reset-rule-length"),
      uppercase: document.getElementById("reset-rule-uppercase"),
      number: document.getElementById("reset-rule-number"),
      special: document.getElementById("reset-rule-special"),
      match: document.getElementById("reset-rule-match")
    };

    function validateResetPassword() {
      const val = resetPassInput.value;
      const confirmVal = resetConfirmInput.value;

      const checks = {
        length: val.length >= 8,
        uppercase: /[A-Z]/.test(val),
        number: /[0-9]/.test(val),
        special: /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(val),
        match: val.length > 0 && val === confirmVal
      };

      if (resetRules.length) {
        resetRules.length.textContent = checks.length ? "✔ Minimum 8 characters long" : "❌ Minimum 8 characters long";
        resetRules.length.style.color = checks.length ? "green" : "red";
      }
      if (resetRules.uppercase) {
        resetRules.uppercase.textContent = checks.uppercase ? "✔ Includes at least one uppercase letter (A–Z)" : "❌ Includes at least one uppercase letter (A–Z)";
        resetRules.uppercase.style.color = checks.uppercase ? "green" : "red";
      }
      if (resetRules.number) {
        resetRules.number.textContent = checks.number ? "✔ Includes at least one number (0–9)" : "❌ Includes at least one number (0–9)";
        resetRules.number.style.color = checks.number ? "green" : "red";
      }
      if (resetRules.special) {
        resetRules.special.textContent = checks.special ? "✔ Includes at least one special character (@, #, $, etc.)" : "❌ Includes at least one special character (@, #, $, etc.)";
        resetRules.special.style.color = checks.special ? "green" : "red";
      }
      if (resetRules.match) {
        resetRules.match.textContent = checks.match ? "✔ Passwords match" : "❌ Passwords match";
        resetRules.match.style.color = checks.match ? "green" : "red";
      }
    }

    resetPassInput.addEventListener("input", validateResetPassword);
    resetConfirmInput.addEventListener("input", validateResetPassword);
  }

  // 4. STEP 3 SUBMIT: Update Password via RPC
  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = resetForm.querySelector("button[type='submit'], input[type='submit']");

      const newPassword = resetPassInput.value;
      const confirmPassword = resetConfirmInput.value;
      const enteredOtp = getEnteredOtp("forgot-otp-container");

      if (newPassword !== confirmPassword || !isPasswordSecure(newPassword)) {
        alert("❌ Please ensure all password requirements are met.");
        return;
      }

      const client = typeof getSupabaseClient === "function" ? getSupabaseClient() : window.supabaseClient;
      if (!client) {
        alert("❌ Supabase client unavailable.");
        return;
      }

      setButtonLoading(submitBtn, true, "Updating Password...");

      try {
        const { error } = await client.rpc("reset_user_password", {
          target_email: recoveryEmail,
          entered_otp: enteredOtp,
          new_password: newPassword
        });

        if (error) {
          alert("❌ Password Reset Failed: " + error.message);
          setButtonLoading(submitBtn, false);
        } else {
          alert("✅ Password updated successfully! Please log in with your new password.");
          window.location.href = "login.html";
        }
      } catch (err) {
        alert("❌ Error: " + err.message);
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // 5. RESEND OTP CODE WITH COOLDOWN
  let isResendCooldown = false;
  if (resendForgotBtn) {
    resendForgotBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (isResendCooldown) return;

      if (!recoveryEmail) {
        alert("❌ Email address missing. Please request a new code.");
        return;
      }

      const client = typeof getSupabaseClient === "function" ? getSupabaseClient() : window.supabaseClient;
      if (!client) {
        alert("❌ Supabase client unavailable.");
        return;
      }

      isResendCooldown = true;
      resendForgotBtn.style.pointerEvents = "none";
      resendForgotBtn.innerText = "Resending...";

      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      try {
        const { error: dbError } = await client
          .from("password_resets")
          .upsert(
            { email: recoveryEmail, otp_code: currentGeneratedOTP, expires_at: expiresAt },
            { onConflict: "email" }
          );

        if (dbError) {
          alert("❌ Failed to refresh code: " + dbError.message);
          isResendCooldown = false;
          resendForgotBtn.style.pointerEvents = "auto";
          resendForgotBtn.innerText = "Resend Code";
          return;
        }

        await sendOtpEmail(recoveryEmail, currentGeneratedOTP);
        alert("✅ A fresh 6-digit code has been sent to " + recoveryEmail);

        // 30-Second Cooldown Timer
        let countdown = 30;
        const interval = setInterval(() => {
          countdown--;
          if (countdown > 0) {
            resendForgotBtn.innerText = `Resend in ${countdown}s`;
          } else {
            clearInterval(interval);
            isResendCooldown = false;
            resendForgotBtn.style.pointerEvents = "auto";
            resendForgotBtn.innerText = "Resend Code";
          }
        }, 1000);

      } catch (err) {
        alert("❌ Error resending OTP email: " + (err.text || err.message));
        isResendCooldown = false;
        resendForgotBtn.style.pointerEvents = "auto";
        resendForgotBtn.innerText = "Resend Code";
      }
    });
  }

  // ==============================================================================
  // LEGACY ACCOUNT MIGRATION FLOW
  // ==============================================================================
  const migPassInput = document.getElementById("mig-password");
  const migConfirmInput = document.getElementById("mig-confirm-password");

  if (migPassInput && migConfirmInput) {
    const migRules = {
      length: document.getElementById("mig-rule-length"),
      uppercase: document.getElementById("mig-rule-uppercase"),
      number: document.getElementById("mig-rule-number"),
      special: document.getElementById("mig-rule-special"),
      match: document.getElementById("mig-rule-match")
    };

    function validateMigPassword() {
      const val = migPassInput.value;
      const confirmVal = migConfirmInput.value;

      const checks = {
        length: val.length >= 8,
        uppercase: /[A-Z]/.test(val),
        number: /[0-9]/.test(val),
        special: /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(val),
        match: val.length > 0 && val === confirmVal
      };

      if (migRules.length) {
        migRules.length.textContent = checks.length ? "✔ Minimum 8 characters long" : "❌ Minimum 8 characters long";
        migRules.length.style.color = checks.length ? "green" : "red";
      }
      if (migRules.uppercase) {
        migRules.uppercase.textContent = checks.uppercase ? "✔ Includes at least one uppercase letter (A–Z)" : "❌ Includes at least one uppercase letter (A–Z)";
        migRules.uppercase.style.color = checks.uppercase ? "green" : "red";
      }
      if (migRules.number) {
        migRules.number.textContent = checks.number ? "✔ Includes at least one number (0–9)" : "❌ Includes at least one number (0–9)";
        migRules.number.style.color = checks.number ? "green" : "red";
      }
      if (migRules.special) {
        migRules.special.textContent = checks.special ? "✔ Includes at least one special character (@, #, $, etc.)" : "❌ Includes at least one special character (@, #, $, etc.)";
        migRules.special.style.color = checks.special ? "green" : "red";
      }
      if (migRules.match) {
        migRules.match.textContent = checks.match ? "✔ Passwords match" : "❌ Passwords match";
        migRules.match.style.color = checks.match ? "green" : "red";
      }
    }

    migPassInput.addEventListener("input", validateMigPassword);
    migConfirmInput.addEventListener("input", validateMigPassword);
  }

  // 1. STEP 1: VALIDATE LEGACY CREDENTIALS & FETCH DETAILS
  if (legacyMigrateForm) {
    legacyMigrateForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = legacyMigrateForm.querySelector("button[type='submit'], input[type='submit']");

      const email = document.getElementById("legacy-email")?.value.trim().toLowerCase() || "";
      const licenseNo = document.getElementById("legacy-license")?.value.trim() || "";
      const ssm = document.getElementById("legacy-ssm")?.value.trim() || "";

      if (!email || !licenseNo || !ssm) {
        alert("❌ Please fill in all legacy account fields.");
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        alert("❌ Supabase client unavailable.");
        return;
      }

      setButtonLoading(submitBtn, true, "Verifying Account...");

      try {
        const { data: legacyRecord, error: legacyErr } = await client
          .from("legacy_accounts")
          .select("*")
          .ilike("legacy_email", email)
          .ilike("license_no", licenseNo)
          .ilike("business_ssm", ssm)
          .maybeSingle();

        if (legacyErr) {
          console.error("Supabase Query Error:", legacyErr);
          alert("❌ Database query error: " + legacyErr.message);
          setButtonLoading(submitBtn, false);
          return;
        }

        if (!legacyRecord) {
          alert("❌ No legacy account found matching these details. Please check your Email, License No, and SSM.");
          setButtonLoading(submitBtn, false);
          return;
        }

        if (legacyRecord.is_migrated) {
          alert("❌ This legacy account has already been migrated. Please log in.");
          setButtonLoading(submitBtn, false);
          return;
        }

        const { data: extRecord } = await client
          .from("mock_legacy_external_db")
          .select("*")
          .ilike("operator_email", email)
          .maybeSingle();

        tempLegacyData = {
          email: legacyRecord.legacy_email,
          licenseNo: legacyRecord.license_no || extRecord?.licence_no_code || "",
          ssm: legacyRecord.business_ssm || extRecord?.ssm_reg_number || "",
          fullName: legacyRecord.operator_name || extRecord?.operator_name || "Legacy Operator",
          businessName: legacyRecord.business_name || extRecord?.operator_business_name || "Legacy Property",
          phone: legacyRecord.phone_number || extRecord?.phone_number || "",
          documentUrl: legacyRecord.document_url || extRecord?.document_url || "",
          state: extRecord?.legacy_state || "Kuala Lumpur",
          district: extRecord?.legacy_district || "Central Business District"
        };

        currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
        await sendOtpEmail(email, currentGeneratedOTP);

        if (stepMigrateCreds) stepMigrateCreds.classList.add("hidden");
        if (stepMigrateOtp) stepMigrateOtp.classList.remove("hidden");

      } catch (err) {
        alert("❌ Error verifying legacy record: " + (err.text || err.message));
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // 2. STEP 2: VERIFY LEGACY OTP
  if (legacyOtpForm) {
    legacyOtpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const enteredOtp = getEnteredOtp("legacy-otp-container");

      if (enteredOtp !== currentGeneratedOTP) {
        alert("❌ Invalid or expired verification code. Please try again.");
        return;
      }

      if (stepMigrateOtp) stepMigrateOtp.classList.add("hidden");
      if (stepMigratePass) stepMigratePass.classList.remove("hidden");
    });
  }

  // 3. STEP 2: RESEND LEGACY OTP WITH COOLDOWN
  if (resendLegacyBtn) {
    resendLegacyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (isLegacyResendCooldown) return;

      if (!tempLegacyData.email) {
        alert("❌ Email missing. Please restart the migration lookup.");
        return;
      }

      isLegacyResendCooldown = true;
      resendLegacyBtn.style.pointerEvents = "none";
      resendLegacyBtn.innerText = "Resending...";

      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();

      try {
        await sendOtpEmail(tempLegacyData.email, currentGeneratedOTP);
        alert("✅ A fresh OTP code has been sent to " + tempLegacyData.email);

        let countdown = 30;
        const interval = setInterval(() => {
          countdown--;
          if (countdown > 0) {
            resendLegacyBtn.innerText = `Resend in ${countdown}s`;
          } else {
            clearInterval(interval);
            isLegacyResendCooldown = false;
            resendLegacyBtn.style.pointerEvents = "auto";
            resendLegacyBtn.innerText = "Resend OTP";
          }
        }, 1000);

      } catch (err) {
        alert("❌ Error resending code: " + (err.text || err.message));
        isLegacyResendCooldown = false;
        resendLegacyBtn.style.pointerEvents = "auto";
        resendLegacyBtn.innerText = "Resend OTP";
      }
    });
  }

  // 4. STEP 3 SUBMIT: COMPLETE LEGACY MIGRATION
  if (legacyPasswordForm) {
    legacyPasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = legacyPasswordForm.querySelector("button[type='submit'], input[type='submit']");

      try {
        const newPassword = document.getElementById("mig-password")?.value || "";
        const confirmPassword = document.getElementById("mig-confirm-password")?.value || "";

        const legacyData = tempLegacyData?.email 
          ? tempLegacyData 
          : (window.tempLegacyData || JSON.parse(sessionStorage.getItem("tempLegacyData") || "{}"));

        if (!legacyData || !legacyData.email) {
          alert("❌ Legacy user data is missing or expired. Please restart the migration lookup.");
          return;
        }

        if (newPassword !== confirmPassword) {
          alert("❌ Passwords do not match.");
          return;
        }

        if (!checkPasswordStrength(newPassword)) {
          alert("❌ Password does not meet security criteria.");
          return;
        }

        const client = typeof getSupabaseClient === "function" ? getSupabaseClient() : window.supabaseClient;
        if (!client) {
          alert("❌ Supabase client initialization failed.");
          return;
        }

        setButtonLoading(submitBtn, true, "Migrating Account...");

        const { data: authData, error: signUpError } = await client.auth.signUp({
          email: legacyData.email,
          password: newPassword,
          options: {
            data: {
              full_name: legacyData.fullName || "",
              business_name: legacyData.businessName || "",
              business_ssm: legacyData.ssm || "",
              phone_no: legacyData.phone || "",
              is_verified: true
            }
          }
        });

        if (signUpError) {
          alert("❌ Sign-Up Error: " + signUpError.message);
          setButtonLoading(submitBtn, false);
          return;
        }

        const userId = authData?.user?.id;
        if (!userId) {
          alert("❌ Failed to create user account ID.");
          setButtonLoading(submitBtn, false);
          return;
        }

        const { error: profileErr } = await client
          .from("profiles")
          .upsert([
            {
              id: userId,
              full_name: legacyData.fullName || "Legacy Operator",
              business_name: legacyData.businessName || "Legacy Property",
              business_ssm: legacyData.ssm || "",
              phone_no: legacyData.phone || "",
              role: "operator"
            }
          ]);

        if (profileErr) console.warn("Profile Insert Notice:", profileErr.message);

        const migratedPropertyId = crypto.randomUUID();
        const { error: propErr } = await client
          .from("properties")
          .insert([
            {
              id: migratedPropertyId,
              owner_id: userId,
              title: legacyData.businessName || "Legacy Property",
              address: `${legacyData.district || "Central"}, ${legacyData.state || "Kuala Lumpur"}`,
              city: legacyData.district || "Central",
              state: legacyData.state || "Kuala Lumpur",
              latitude: 3.1390,
              longitude: 101.6869,
              contact_info: legacyData.phone || "",
              license_number: legacyData.licenseNo || "",
              is_verified: true
            }
          ]);

        if (propErr) {
          alert("❌ Property Creation Error: " + propErr.message);
          setButtonLoading(submitBtn, false);
          return;
        }

        const rawFileName = legacyData.documentUrl
          ? legacyData.documentUrl.split('/').pop().split('?')[0]
          : `SSM_Certificate_${legacyData.ssm || 'default'}.pdf`;

        const { error: complianceErr } = await client
          .from("compliance_documents")
          .insert([
            {
              user_id: userId,
              property_id: migratedPropertyId,
              document_type: "SSM Certificate",
              document_name: `SSM Certificate - ${legacyData.businessName || "Legacy Property"}`,
              file_name: rawFileName,
              file_path: legacyData.documentUrl || `documents/ssm/${rawFileName}`,
              file_type: "application/pdf",
              file_size: 0,
              status: "APPROVED",
              review_status: "APPROVED",
              ssm_number: legacyData.ssm || "N/A",
              operator_name: legacyData.fullName || "Legacy Operator",
              admin_feedback: "SSM License automatically verified and approved during migration."
            }
          ]);

        if (complianceErr) console.warn("Compliance Insert Notice:", complianceErr.message);

        await client
          .from("legacy_accounts")
          .update({ is_migrated: true })
          .ilike("legacy_email", legacyData.email);

        await client
          .from("mock_legacy_external_db")
          .update({ system_status: "MIGRATED" })
          .ilike("operator_email", legacyData.email);

        alert("✅ Migration Successful! Redirecting to login...");
        window.location.href = "login.html";

      } catch (err) {
        console.error("Migration Exception:", err);
        alert("❌ Unexpected Error: " + (err.message || "Execution failed. Check browser console."));
        setButtonLoading(submitBtn, false);
      }
    });
  }

});