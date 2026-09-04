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

  let tempUserData = { email: "", password: "", fullName: "", phone: "" };
  let tempLegacyData = { email: "", licenseNo: "", ssm: "", fullName: "", businessName: "", phone: "", documentUrl: "" };
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

  // ==============================================================================
  // 0. RESET PASSWORD FLOW (EMAILJS OTP -> NEW PASSWORD)
  // ==============================================================================
  const stepForgotReq = document.getElementById("step-forgot-request");
  const stepForgotOtp = document.getElementById("step-forgot-otp");
  const stepForgotPass = document.getElementById("step-forgot-password");

  const forgotReqForm = document.getElementById("forgot-request-form");
  const forgotOtpForm = document.getElementById("forgot-otp-form");
  const resetForm = document.getElementById("reset-password-form");

  const resetPassInput = document.getElementById("reset-password");
  const resetConfirmInput = document.getElementById("reset-confirm-password");

  let recoveryEmail = "";

  if (forgotReqForm) {
    forgotReqForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      recoveryEmail = document.getElementById("forgot-email").value.trim();

      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();

      try {
        await sendOtpEmail(recoveryEmail, currentGeneratedOTP);

        stepForgotReq.classList.add("hidden");
        stepForgotOtp.classList.remove("hidden");
        setupOtpInputs("forgot-otp-container");
        alert("✅ A 6-digit verification code has been sent to " + recoveryEmail);
      } catch (err) {
        alert("❌ Error sending email: " + (err.text || JSON.stringify(err)));
      }
    });
  }

  if (forgotOtpForm) {
    forgotOtpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const token = getEnteredOtp("forgot-otp-container");

      if (token !== currentGeneratedOTP) {
        alert("❌ Invalid or incorrect verification code.");
        return;
      }

      stepForgotOtp.classList.add("hidden");
      stepForgotPass.classList.remove("hidden");
    });
  }

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

  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const newPassword = resetPassInput.value;
      const confirmPassword = resetConfirmInput.value;

      if (newPassword !== confirmPassword || !isPasswordSecure(newPassword)) {
        alert("❌ Please ensure all password requirements are met.");
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        alert("❌ Supabase client unavailable.");
        return;
      }

      try {
        const { data, error } = await client.auth.updateUser({
          password: newPassword
        });

        if (error) {
          alert("❌ Password Reset Failed: " + error.message);
        } else {
          alert("✅ Password updated successfully! Please log in with your new password.");
          window.location.href = "login.html";
        }
      } catch (err) {
        alert("❌ Error: " + err.message);
      }
    });
  }

  // ==============================================================================
  // 1. MIGRATE LEGACY ACCOUNT HANDLERS (MOCK DB -> PROFILES & COMPLIANCE)
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

  if (legacyMigrateForm) {
    legacyMigrateForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("legacy-email")?.value.trim().toLowerCase() || "";
      const licenseNo = document.getElementById("legacy-license")?.value.trim() || "";
      const ssm = document.getElementById("legacy-ssm")?.value.trim() || "";

      const client = getSupabaseClient();
      if (!client) return;

      // Query mock_legacy_external_db using its native schema
      const { data: legacyRecord, error: legacyErr } = await client
        .from("mock_legacy_external_db")
        .select("*")
        .ilike("operator_email", email)
        .ilike("licence_no_code", licenseNo)
        .eq("ssm_reg_number", ssm)
        .single();

      if (legacyErr || !legacyRecord) {
        alert("❌ No legacy account found matching these details.");
        return;
      }

      if (legacyRecord.system_status === "MIGRATED") {
        alert("❌ This legacy account has already been migrated. Please log in with your credentials.");
        return;
      }

      // Map legacy schema to application structure (ETL transformation)
      tempLegacyData = {
        email: legacyRecord.operator_email,
        licenseNo: legacyRecord.licence_no_code,
        ssm: legacyRecord.ssm_reg_number,
        fullName: legacyRecord.operator_name || "Legacy Operator",
        businessName: legacyRecord.operator_business_name || "Legacy Business",
        phone: legacyRecord.phone_number || "",
        documentUrl: legacyRecord.document_url || ""
      };

      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();

      try {
        await sendOtpEmail(email, currentGeneratedOTP);
        stepMigrateCreds.classList.add("hidden");
        stepMigrateOtp.classList.remove("hidden");
        alert("✅ Verification OTP code sent to " + email);
      } catch (err) {
        alert("❌ Error sending OTP: " + (err.text || JSON.stringify(err)));
      }
    });
  }

  if (legacyOtpForm) {
    legacyOtpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const enteredOtp = getEnteredOtp("legacy-otp-container");

      if (enteredOtp !== currentGeneratedOTP) {
        alert("❌ Invalid or expired verification code. Please try again.");
        return;
      }

      stepMigrateOtp.classList.add("hidden");
      stepMigratePass.classList.remove("hidden");
    });
  }

  if (resendLegacyBtn) {
    resendLegacyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!tempLegacyData.email) return;

      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        await sendOtpEmail(tempLegacyData.email, currentGeneratedOTP);
        alert("✅ A fresh OTP code has been sent to " + tempLegacyData.email);
      } catch (err) {
        alert("❌ Error resending code: " + (err.text || JSON.stringify(err)));
      }
    });
  }

  if (legacyPasswordForm) {
    legacyPasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const newPassword = document.getElementById("mig-password")?.value || "";
      const confirmPassword = document.getElementById("mig-confirm-password")?.value || "";

      if (newPassword !== confirmPassword || !isPasswordSecure(newPassword)) {
        alert("❌ Password does not meet required security criteria.");
        return;
      }

      const client = getSupabaseClient();
      try {
        // 1. Create Supabase Auth User with metadata
        const { data: authData, error: signUpError } = await client.auth.signUp({
          email: tempLegacyData.email,
          password: newPassword,
          options: {
            data: {
              full_name: tempLegacyData.fullName,
              business_name: tempLegacyData.businessName,
              business_ssm: tempLegacyData.ssm,
              phone_no: tempLegacyData.phone,
              is_verified: true
            }
          }
        });

        if (signUpError) {
          alert("❌ Migration Error: " + signUpError.message);
          return;
        }

        // 2. Load transformed profile into clean public.profiles
        if (authData?.user) {
          const { error: profileError } = await client
            .from("profiles")
            .insert([
              {
                id: authData.user.id,
                full_name: tempLegacyData.fullName,
                business_name: tempLegacyData.businessName,
                business_ssm: tempLegacyData.ssm,
                phone_no: tempLegacyData.phone,
                role: "operator"
              }
            ]);

          if (profileError) {
            console.warn("Profile Insert Notice:", profileError.message);
          }

          // 3. Ingest legacy document into document compliance pipeline ONLY upon successful migration
          if (tempLegacyData.documentUrl) {
            const { error: complianceErr } = await client
              .from("document_compliance")
              .insert([
                {
                  profile_id: authData.user.id,
                  document_url: tempLegacyData.documentUrl,
                  status: "PENDING_REVIEW",
                  submitted_at: new Date().toISOString()
                }
              ]);

            if (complianceErr) {
              console.warn("Compliance Ingestion Notice:", complianceErr.message);
            }
          }
        }

        
        // 4. Update status in legacy_accounts table to migrated
      const { error: updateLegacyErr } = await client
        .from("legacy_accounts")
        .update({ is_migrated: true })
        .eq("legacy_email", tempLegacyData.email);

if (updateLegacyErr) {
  console.warn("Legacy Table Update Notice:", updateLegacyErr.message);
}

        alert("✅ Legacy account migrated successfully! Document ingested for compliance review.");
        window.location.href = "login.html";

      } catch (err) {
        alert("❌ Migration Failed: " + err.message);
      }
    });
  }

  // ==============================================================================
  // 2. REGISTRATION HANDLERS
  // ==============================================================================
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("reg-email")?.value.trim() || "";
      const password = document.getElementById("reg-password")?.value || "";
      const confirmPassword = document.getElementById("reg-confirm-password")?.value || "";
      const fullName = document.getElementById("reg-fullname")?.value.trim() || "";
      const businessName = document.getElementById("reg-business-name")?.value.trim() || "";
      const phone = document.getElementById("reg-phone")?.value.trim() || "";

      if (!email || !password || !confirmPassword || !fullName || !businessName || !phone) {
        alert("❌ Please complete all required fields.");
        return;
      }

      if (!isPasswordSecure(password) || password !== confirmPassword) {
        alert("❌ Password check failed.");
        return;
      }

      tempUserData = { email, password, fullName, businessName, phone };
      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();

      try {
        await sendOtpEmail(email, currentGeneratedOTP);
        if (stepRegister) stepRegister.classList.add("hidden");
        if (stepOtp) stepOtp.classList.remove("hidden");
        alert("✅ 6-Digit OTP code sent to " + email);
      } catch (err) {
        alert("❌ Error sending OTP email: " + (err.text || JSON.stringify(err)));
      }
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!tempUserData.email) return;

      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        await sendOtpEmail(tempUserData.email, currentGeneratedOTP);
        alert("✅ A fresh OTP code has been sent to " + tempUserData.email);
      } catch (err) {
        alert("❌ Error resending code: " + (err.text || JSON.stringify(err)));
      }
    });
  }

  if (otpForm) {
    otpForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const client = getSupabaseClient();
      const token = getEnteredOtp("otp-container");

      if (token !== currentGeneratedOTP) {
        alert("❌ Invalid verification code.");
        return;
      }

      try {
        // 1. Create Supabase Auth User with metadata
        const { data: authData, error: signUpError } = await client.auth.signUp({
          email: tempUserData.email,
          password: tempUserData.password,
          options: {
            data: {
              full_name: tempUserData.fullName,
              business_name: tempUserData.businessName,
              phone_no: tempUserData.phone
            }
          }
        });

        if (signUpError) {
          alert("❌ Registration Error: " + signUpError.message);
          return;
        }

        // 2. Insert into profiles table
        if (authData?.user) {
          const { error: profileError } = await client
            .from("profiles")
            .insert([
              {
                id: authData.user.id,
                full_name: tempUserData.fullName,
                business_name: tempUserData.businessName,
                phone_no: tempUserData.phone,
                role: "operator"
              }
            ]);

          if (profileError) {
            console.warn("Profile Insert Notice:", profileError.message);
          }
        }

        alert("✅ Account created successfully! Redirecting to login...");
        window.location.href = "login.html";

      } catch (err) {
        alert("❌ Registration Exception: " + err.message);
      }
    });
  }

  // ==============================================================================
  // 3. LOGIN HANDLER & REMEMBER ME PERSISTENCE
  // ==============================================================================
  if (loginForm) {
    const emailInput = document.getElementById("email");
    const rememberCheckbox = document.getElementById("remember-me");

    const savedEmail = localStorage.getItem("mystra_remembered_email");
    if (savedEmail && emailInput && rememberCheckbox) {
      emailInput.value = savedEmail;
      rememberCheckbox.checked = true;
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = emailInput ? emailInput.value.trim() : "";
      const password = document.getElementById("password") ? document.getElementById("password").value : "";

      if (email && rememberCheckbox && rememberCheckbox.checked) {
        localStorage.setItem("mystra_remembered_email", email);
      } else {
        localStorage.removeItem("mystra_remembered_email");
      }

      if (!email || !password) {
        alert("❌ Please enter both your email and password.");
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        alert("❌ Connection error: Supabase client unavailable.");
        return;
      }

      try {
        // 1. Authenticate credentials
        const { data: authData, error: authError } = await client.auth.signInWithPassword({
          email: email,
          password: password,
        });

        if (authError) {
          alert("❌ Invalid email or password.");
          return;
        }

        // 2. Query user role from public.profiles
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .single();

        if (profileError) {
          console.warn("Could not retrieve profile role:", profileError.message);
        }

        // 3. Redirect to destination based on role
        if (profile && (profile.role === "admin" || profile.role === "gov_admin")) {
          alert("✅ Admin login successful! Redirecting to dashboard...");
          window.location.href = "gov-admin-dashboard.html";
        } else {
          alert("✅ Login successful! Redirecting...");
          window.location.href = "index.html";
        }

      } catch (err) {
        alert("❌ Login Error: " + err.message);
      }
    });
  }
});