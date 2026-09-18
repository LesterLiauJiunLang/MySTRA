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
// 0. RESET PASSWORD FLOW (EMAILJS OTP -> SECURE DB RPC FUNCTION)
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
currentGeneratedOTP = null;

if (forgotReqForm) {
  forgotReqForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    recoveryEmail = document.getElementById("forgot-email").value.trim().toLowerCase();

    if (!recoveryEmail) {
      alert("Please enter a valid email address.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      alert("❌ Supabase client unavailable.");
      return;
    }

    // 1. Generate 6-digit OTP locally
    currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      // 2. Save OTP to public.password_resets table (expires in 10 minutes)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: dbError } = await client
        .from("password_resets")
        .upsert(
          { email: recoveryEmail, otp_code: currentGeneratedOTP, expires_at: expiresAt },
          { onConflict: "email" }
        );

      if (dbError) {
        alert("❌ Failed to register reset request: " + dbError.message);
        return;
      }

      // 3. Send OTP code via EmailJS
      await sendOtpEmail(recoveryEmail, currentGeneratedOTP);

      stepForgotReq.classList.add("hidden");
      stepForgotOtp.classList.remove("hidden");
      setupOtpInputs("forgot-otp-container");
      alert("✅ A 6-digit verification code has been sent to " + recoveryEmail);
    } catch (err) {
      alert("❌ Error sending OTP email: " + (err.text || err.message));
    }
  });
}

if (forgotOtpForm) {
  forgotOtpForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const enteredOtp = getEnteredOtp("forgot-otp-container");

    if (enteredOtp !== currentGeneratedOTP) {
      alert("❌ Invalid verification code. Please try again.");
      return;
    }

    alert("✅ Code verified successfully!");
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
    const enteredOtp = getEnteredOtp("forgot-otp-container");

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
      // 4. Call SQL RPC Function to perform secure password update
      const { data, error } = await client.rpc("reset_user_password", {
        target_email: recoveryEmail,
        entered_otp: enteredOtp,
        new_password: newPassword
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
// RESEND FORGOT PASSWORD CODE
// ==============================================================================
const resendForgotBtn = document.getElementById("link-resend-forgot-otp");

if (resendForgotBtn) {
  resendForgotBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!recoveryEmail) {
      alert("❌ Email address missing. Please request a new code.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      alert("❌ Supabase client unavailable.");
      return;
    }

    // Generate fresh OTP code and 10-minute expiration
    currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    try {
      // Upsert fresh OTP in Supabase DB
      const { error: dbError } = await client
        .from("password_resets")
        .upsert(
          { email: recoveryEmail, otp_code: currentGeneratedOTP, expires_at: expiresAt },
          { onConflict: "email" }
        );

      if (dbError) {
        alert("❌ Failed to refresh code: " + dbError.message);
        return;
      }

      // Re-send EmailJS notification
      await sendOtpEmail(recoveryEmail, currentGeneratedOTP);
      alert("✅ A fresh 6-digit code has been sent to " + recoveryEmail);
    } catch (err) {
      alert("❌ Error resending OTP email: " + (err.text || err.message));
    }
  });
}
// ==============================================================================
// 1. MIGRATE LEGACY ACCOUNT HANDLERS (MOCK DB -> PROFILES & COMPLIANCE)
// ==============================================================================
const migPassInput = document.getElementById("mig-password");
const migConfirmInput = document.getElementById("mig-confirm-password");

// Helper function to validate password security criteria directly
function checkPasswordStrength(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(password)
  );
}

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

    // 1. Fetch internal legacy account details
    const { data: legacyRecord, error: legacyErr } = await client
      .from("legacy_accounts")
      .select("*")
      .ilike("legacy_email", email)
      .ilike("license_no", licenseNo)
      .eq("business_ssm", ssm)
      .single();

    if (legacyErr || !legacyRecord) {
      alert("❌ No legacy account found matching these details.");
      return;
    }

    if (legacyRecord.is_migrated) {
      alert("❌ This legacy account has already been migrated. Please log in.");
      return;
    }

    // 2. Extract full Legacy Property record from External DB (ETL Extract)
    const { data: extRecord } = await client
      .from("mock_legacy_external_db")
      .select("*")
      .ilike("operator_email", email)
      .single();

    // 3. Store extracted property & user data into temporary memory
    tempLegacyData = {
      email: legacyRecord.legacy_email,
      licenseNo: legacyRecord.license_no || extRecord?.licence_no_code || "",
      ssm: legacyRecord.business_ssm || extRecord?.ssm_reg_number || "",
      fullName: legacyRecord.operator_name || extRecord?.operator_name || "Legacy Operator",
      businessName: legacyRecord.business_name || extRecord?.operator_business_name || "Legacy Property",
      phone: legacyRecord.phone_number || extRecord?.phone_number || "",
      documentUrl: legacyRecord.document_url || extRecord?.document_url || "",
      // Physical legacy property location data:
      state: extRecord?.legacy_state || "Kuala Lumpur",
      district: extRecord?.legacy_district || "Central Business District"
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

    if (newPassword !== confirmPassword || !checkPasswordStrength(newPassword)) {
      alert("❌ Password does not meet required security criteria.");
      return;
    }

    const client = getSupabaseClient();
    try {
      // 1. Create Supabase Auth User
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

      const userId = authData?.user?.id;
      if (!userId) {
        alert("❌ Failed to resolve user ID during registration.");
        return;
      }

      // Establish session for RLS policies
      if (!authData.session) {
        await client.auth.signInWithPassword({
          email: tempLegacyData.email,
          password: newPassword
        });
      }

      // 2. Create Profile
      await client
        .from("profiles")
        .upsert([
          {
            id: userId,
            full_name: tempLegacyData.fullName,
            business_name: tempLegacyData.businessName,
            business_ssm: tempLegacyData.ssm,
            phone_no: tempLegacyData.phone,
            role: "operator"
          }
        ]);

      // 3. ETL LOAD: Transfer the existing legacy property into public.properties
      const migratedPropertyId = crypto.randomUUID();

      const { error: propErr } = await client
        .from("properties")
        .insert([
          {
            id: migratedPropertyId,
            owner_id: userId, // Attach owner to transformed property
            title: tempLegacyData.businessName,
            name: tempLegacyData.businessName,
            address: `${tempLegacyData.district}, ${tempLegacyData.state}`,
            city: tempLegacyData.district,
            state: tempLegacyData.state,
            latitude: 3.1390,  // Standard regional coordinate default
            longitude: 101.6869,
            contact_info: tempLegacyData.phone,
            license_number: tempLegacyData.licenseNo,
            is_verified: true
          }
        ]);

      if (propErr) {
        console.error("❌ Property Migration Error Details:", propErr);
        alert("❌ Migration halted on Property Transfer: " + propErr.message);
        return;
      }

      // 4. Ingest compliance document linked to the migrated property
      const rawFileName = tempLegacyData.documentUrl
        ? tempLegacyData.documentUrl.split('/').pop().split('?')[0]
        : `SSM_Certificate_${tempLegacyData.ssm}.pdf`;

      const { error: complianceErr } = await client
        .from("compliance_documents")
        .insert([
          {
            user_id: userId,
            property_id: migratedPropertyId,
            document_type: "SSM Certificate",
            document_name: `SSM Certificate - ${tempLegacyData.businessName}`,
            file_name: rawFileName,
            file_path: tempLegacyData.documentUrl || `documents/ssm/${rawFileName}`,
            file_type: "application/pdf",
            file_size: 0,
            status: "APPROVED",
            review_status: "APPROVED",
            ssm_number: tempLegacyData.ssm,
            operator_name: tempLegacyData.fullName,
            admin_feedback: "SSM License automatically verified and approved during migration.",
            uploaded_at: new Date().toISOString()
          }
        ]);

      if (complianceErr) {
        console.error("❌ Compliance Ingestion Error Details:", complianceErr);
        alert("⚠️ Property migrated, but document insertion failed: " + complianceErr.message);
      }

      // 5. Update Migration Status on legacy source tables
      await client
        .from("legacy_accounts")
        .update({ is_migrated: true })
        .ilike("legacy_email", tempLegacyData.email);

      await client
        .from("mock_legacy_external_db")
        .update({ system_status: "MIGRATED" })
        .ilike("operator_email", tempLegacyData.email);

      alert("✅ Existing legacy property and account successfully migrated into the platform!");
      window.location.href = "login.html";

    } catch (err) {
      alert("❌ Migration Failed: " + err.message);
    }
  });
}

  // ==============================================================================
  // 3. MySTRA LOGIN AUTHENTICATION & CLIENT-SIDE LOCKOUT ENGINE
  // ==============================================================================
  if (loginForm) {
    const emailInput = document.getElementById("email");
    const rememberCheckbox = document.getElementById("remember-me");

    const MAX_ATTEMPTS = 5;
    const LOCKOUT_TIME_MS = 15 * 60 * 1000; // 15 minutes
    const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

    const savedEmail = localStorage.getItem("mystra_remembered_email");
    if (savedEmail && emailInput && rememberCheckbox) {
      emailInput.value = savedEmail;
      rememberCheckbox.checked = true;
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
      const password = document.getElementById("password") ? document.getElementById("password").value : "";

      // Flow A5: Empty Required Fields
      if (!email || !password) {
        alert("Please enter both your email and password.");
        return;
      }

      // Flow A4: Rate Limiting / Lockout Check
const now = Date.now();
let attemptsData = JSON.parse(localStorage.getItem("mystra_login_attempts") || "{}");
let userAttempts = attemptsData[email] || { count: 0, firstAttemptTime: now, lockUntil: 0 };

if (userAttempts.lockUntil && now < userAttempts.lockUntil) {
  // Calculate remaining seconds
  const remainingMs = userAttempts.lockUntil - now;
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

  alert(`Too many failed attempts. Please try again in ${remainingMinutes}m ${remainingSeconds}s.`);
  return;
}

      // Reset attempt window if 10 minutes have passed since first failed attempt
      if (now - userAttempts.firstAttemptTime > ATTEMPT_WINDOW_MS) {
        userAttempts = { count: 0, firstAttemptTime: now, lockUntil: 0 };
      }

      const client = getSupabaseClient();
      if (!client) {
        alert("❌ Connection error: Supabase client unavailable.");
        return;
      }

      try {
        // Step 5: Authenticate credentials against Supabase
        const { data: authData, error: authError } = await client.auth.signInWithPassword({
          email: email,
          password: password,
        });

        // Flow A1 & A2: Invalid Credentials Handling
        if (authError) {
          userAttempts.count += 1;
          if (userAttempts.count === 1) {
            userAttempts.firstAttemptTime = now;
          }

          if (userAttempts.count >= MAX_ATTEMPTS) {
            userAttempts.lockUntil = now + LOCKOUT_TIME_MS;
            attemptsData[email] = userAttempts;
            localStorage.setItem("mystra_login_attempts", JSON.stringify(attemptsData));
            alert("Too many failed attempts. Please try again in 15 minutes.");
            return;
          }

          attemptsData[email] = userAttempts;
          localStorage.setItem("mystra_login_attempts", JSON.stringify(attemptsData));

          alert("Invalid email or password.");
          return;
        }

        // Reset failed attempt counter on successful login
        delete attemptsData[email];
        localStorage.setItem("mystra_login_attempts", JSON.stringify(attemptsData));

        // Flow A7: Remember Me handling
        if (emailInput && rememberCheckbox && rememberCheckbox.checked) {
          localStorage.setItem("mystra_remembered_email", email);
        } else {
          localStorage.removeItem("mystra_remembered_email");
        }

        // Step 6 / Flow A3: Check Verification State & Role
        const { data: profile } = await client
          .from("profiles")
          .select("role, is_verified")
          .eq("id", authData.user.id)
          .single();

        const isVerified = profile?.is_verified ?? authData.user.user_metadata?.is_verified ?? false;

        // Step 7: Redirect to respective dashboard
        if (profile && (profile.role === "admin" || profile.role === "gov_admin")) {
          alert("✅ Admin login successful! Redirecting...");
          window.location.href = "gov-admin-dashboard.html";
        } else {
          alert("✅ Login successful! Redirecting...");
          // Pass verification state to index page so banner can render if false (Flow A3)
          window.location.href = isVerified ? "index.html" : "index.html?verified=false";
        }

      } catch (err) {
        alert("❌ Login Error: " + err.message);
      }
    });
  }
});

