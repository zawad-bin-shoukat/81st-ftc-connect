import 'package:flutter/material.dart';

import '../api_client.dart';
import 'verify_code_screen.dart';
import 'registration_screen.dart';

class PhoneSignInScreen extends StatefulWidget {
  const PhoneSignInScreen({super.key});
  @override
  State<PhoneSignInScreen> createState() => _PhoneSignInScreenState();
}

class _PhoneSignInScreenState extends State<PhoneSignInScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = <String, dynamic>{'phone': _phone.text.trim()};
    const path = '/auth/login';
    try {
      final challenge = await ApiScope.of(context)
          .request('POST', path, body: body);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => VerifyCodeScreen(
            phone: _phone.text.trim(),
            challenge: challenge,
            requestPath: path,
            requestBody: body,
          ),
        ),
      );
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Phone sign-in')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Icon(Icons.lock_outline, size: 56),
              const SizedBox(height: 20),
              Text(
                'Sign in to your roster profile',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              const Text(
                'Enter the phone number listed on your roster profile. First-time members already in the roster need no registration. If you already linked a different login number, keep using it.',
              ),
              const SizedBox(height: 24),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumber],
                decoration: const InputDecoration(
                  labelText: 'Login phone number',
                  hintText: '+880…',
                ),
                validator: (v) => v == null || v.trim().isEmpty
                    ? 'Enter your login phone number'
                    : null,
              ),
              const SizedBox(height: 16),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              FilledButton(
                onPressed: _busy ? null : _continue,
                child: Text(_busy ? 'Please wait…' : 'Continue'),
              ),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => const RegistrationScreen(),
                        ),
                      ),
                child: const Text('Not in the roster? Request membership'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Only approved 81st FTC members can sign in.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
