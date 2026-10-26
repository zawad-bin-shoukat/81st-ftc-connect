import 'package:flutter/material.dart';

import 'preview_shell.dart';

/// These credentials unlock fictional data stored only in the app. They do not
/// authenticate against the member API or grant access to the private roster.
class ReviewerSignInScreen extends StatefulWidget {
  const ReviewerSignInScreen({super.key});

  @override
  State<ReviewerSignInScreen> createState() => _ReviewerSignInScreenState();
}

class _ReviewerSignInScreenState extends State<ReviewerSignInScreen> {
  static const username = 'ftc-reviewer';
  static const password = 'FTC-Review-2026';

  final _form = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _password = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  void _signIn() {
    if (!_form.currentState!.validate()) return;
    if (_username.text.trim() != username || _password.text != password) {
      setState(() => _error = 'Check the reviewer username and password.');
      return;
    }
    setState(() => _error = null);
    _password.clear();
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => const PreviewShell(reviewerMode: true),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Reviewer sign-in')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text(
                'Use the reusable reviewer credentials provided in the store review instructions. This demo contains fictional profiles and never connects to the private member directory.',
              ),
              const SizedBox(height: 24),
              TextFormField(
                controller: _username,
                decoration: const InputDecoration(labelText: 'Username'),
                autofillHints: const [AutofillHints.username],
                validator: (value) => (value?.trim().isEmpty ?? true)
                    ? 'Enter the reviewer username'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _password,
                decoration: const InputDecoration(labelText: 'Password'),
                obscureText: true,
                autofillHints: const [AutofillHints.password],
                onFieldSubmitted: (_) => _signIn(),
                validator: (value) => (value?.isEmpty ?? true)
                    ? 'Enter the reviewer password'
                    : null,
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const SizedBox(height: 24),
              FilledButton(onPressed: _signIn, child: const Text('Open demo')),
            ],
          ),
        ),
      ),
    ),
  );
}
