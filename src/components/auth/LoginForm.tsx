import React, { useState } from 'react';
import { Button, Input, Card } from '../UI';
import { Mail, Lock, User, ArrowRight, Chrome } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../../lib/api';

export const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/login', { email });
      window.location.reload(); // Trigger re-auth check in App.tsx
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Erreur lors de la connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md p-8 sm:p-10 border-none shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-primary/40 via-brand-primary to-brand-primary/40" />
      
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-50 rounded-2xl mb-6 text-brand-primary">
           <User size={32} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
          Accès Simplifié
        </h1>
        <p className="text-gray-500 text-sm">
          Entrez votre email pour accéder au système
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Adresse Email</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <Input
              type="email"
              placeholder="votre@email.com"
              className="pl-12"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-red-500 text-xs font-medium px-1"
          >
            {error}
          </motion.p>
        )}

        <Button type="submit" className="w-full mt-4 group" isLoading={loading}>
          Se connecter
          <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-100">
        <p className="text-xs text-center text-gray-400 font-medium italic">
          Système d'archivage MAE - Accès Restreint
        </p>
      </div>
    </Card>
  );
};
