import 'package:flutter/material.dart';

import '../api_client.dart';
import 'verify_code_screen.dart';

class TestSignInScreen extends StatefulWidget {
  const TestSignInScreen({super.key});
  @override
  State<TestSignInScreen> createState() => _TestSignInScreenState();
}

class _TestSignInScreenState extends State<TestSignInScreen> {
  final _form = GlobalKey<FormState>();
  final _id = TextEditingController(text: '1000');
  final _phone = TextEditingController();
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _id.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final body = {
      'testId': int.parse(_id.text.trim()),
      'phone': _phone.text.trim(),
    };
    try {
      final challenge = await ApiScope.of(context)
          .request('POST', '/auth/test/login', body: body);
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => VerifyCodeScreen(
            phone: _phone.text.trim(),
            challenge: challenge,
            requestPath: '/auth/test/login',
            requestBody: body,
            verificationPath: '/auth/test/verify',
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
    appBar: AppBar(title: const Text('Administrator / test sign-in')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Use the separate identity configured by the app owner. This is outside the participant roster; profile edits stay in your test profile.',
                ),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _id,
                  enabled: !_busy,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Test ID'),
                  validator: (value) {
                    final id = int.tryParse(value?.trim() ?? '');
                    return id == null || id < 1 || id > 2147483647
                        ? 'Enter a valid test ID'
                        : null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _phone,
                  enabled: !_busy,
                  keyboardType: TextInputType.phone,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  decoration: const InputDecoration(
                    labelText: 'Login phone number',
                  ),
                  validator: (value) => (value?.trim().isEmpty ?? true)
                      ? 'Enter your login phone number'
                      : null,
                ),
                const SizedBox(height: 16),
                if (_error != null)
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                FilledButton(
                  onPressed: _busy ? null : _continue,
                  child: Text(_busy ? 'Please wait…' : 'Continue'),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
