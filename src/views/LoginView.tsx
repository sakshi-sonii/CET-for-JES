import React, { useState } from 'react';
import { ChevronsUp } from 'lucide-react';
import type { Course } from '../types';
import { api } from '../api';

interface LoginViewProps {
  onLoginSuccess: (token: string, user: any) => void;
  courses: Course[];
}

const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, courses }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    role: "student" as "student" | "teacher",
    course: "",
  });

  const handleLogin = async () => {
    setError("");
    if (!formData.email || !formData.password) {
      setError("Email and password are required");
      return;
    }

    try {
      setSubmitting(true);
      const res = await api("auth", "POST", {
        email: formData.email,
        password: formData.password,
        mode: "login",
      });

      if (res.token) {
        const userData = { ...res.user, _id: res.user._id || res.user.id };

        if ((userData.role === 'student' || userData.role === 'teacher') && !userData.approved) {
          throw new Error("Your account is pending admin approval. Please try again later.");
        }

        localStorage.setItem("token", res.token);
        onLoginSuccess(res.token, userData);
      } else {
        throw new Error(res.message || "Login failed");
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async () => {
    setError("");

    if (!formData.email || !formData.password || !formData.name) {
      setError("All fields are required");
      return;
    }

    if (formData.role === "student" && !formData.course) {
      setError("Please select a course");
      return;
    }

    try {
      setSubmitting(true);
      const res = await api("auth", "POST", {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        role: formData.role,
        course: formData.course,
        mode: "register",
      });

      if (res.error) {
        throw new Error(res.message || "Registration failed");
      }

      alert(res.message || "Registered successfully! Please login.");
      setIsLogin(true);
      setFormData({ ...formData, password: "" });
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <ChevronsUp className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 cursive-font">RANK UP</h1>
          <p className="text-gray-600 mt-2">MHT-CET Test Preparation</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 rounded-lg font-medium transition ${
              isLogin ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 rounded-lg font-medium transition ${
              !isLogin ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {!isLogin && (
            <input
              type="text"
              placeholder="Full Name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />

          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />

          {!isLogin && (
            <>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: e.target.value as "student" | "teacher",
                  })
                }
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>

              {formData.role === "student" && (
                <select
                  value={formData.course}
                  onChange={(e) =>
                    setFormData({ ...formData, course: e.target.value })
                  }
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select Course</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          <button
            disabled={submitting}
            onClick={isLogin ? handleLogin : handleRegister}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {submitting ? "Please wait..." : isLogin ? "Login" : "Register"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginView;