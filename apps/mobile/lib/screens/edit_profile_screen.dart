import 'package:flutter/material.dart';

import '../preview_member.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({required this.member, super.key});

  final PreviewMember member;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final Map<String, TextEditingController> _fields = {
    'name': TextEditingController(text: widget.member.name),
    'education': TextEditingController(text: widget.member.education),
    'university': TextEditingController(text: widget.member.university),
    'phone': TextEditingController(text: widget.member.phone),
    'email': TextEditingController(text: widget.member.email),
    'bloodGroup': TextEditingController(text: widget.member.bloodGroup),
    'homeDistrict': TextEditingController(text: widget.member.homeDistrict),
    'aboutMe': TextEditingController(text: widget.member.aboutMe),
    'favouriteQuotation': TextEditingController(
      text: widget.member.favouriteQuotation,
    ),
  };

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  String value(String key) => _fields[key]!.text.trim();

  Widget field(
    String key,
    String label, {
    bool required = true,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: _fields[key],
        maxLines: maxLines,
        keyboardType: key == 'email'
            ? TextInputType.emailAddress
            : TextInputType.text,
        decoration: InputDecoration(labelText: label),
        validator: (text) {
          final trimmed = text?.trim() ?? '';
          if (required && trimmed.isEmpty) return '$label is required';
          if (key == 'email' &&
              !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(trimmed)) {
            return 'Enter a valid email address';
          }
          return null;
        },
      ),
    );
  }

  void save() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.of(context).pop(
      PreviewMember(
        name: value('name'),
        ftcId: widget.member.ftcId,
        section: widget.member.section,
        cadre: widget.member.cadre,
        bcsBatch: widget.member.bcsBatch,
        education: value('education'),
        university: value('university'),
        phone: value('phone'),
        email: value('email'),
        bloodGroup: value('bloodGroup'),
        homeDistrict: value('homeDistrict'),
        aboutMe: value('aboutMe'),
        favouriteQuotation: value('favouriteQuotation'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit preview profile')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'Preview only. Saving here updates this screen temporarily; it does not change the database.',
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.add_a_photo_outlined),
                    title: Text('Profile photo'),
                    subtitle: Text(
                      'Photo upload will be available after storage is connected.',
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                field('name', 'Name'),
                field('education', 'Education'),
                field('university', 'University'),
                field('phone', 'WhatsApp contact'),
                field('email', 'Email'),
                field('bloodGroup', 'Blood group'),
                field('homeDistrict', 'Home district'),
                field('aboutMe', 'About me', required: false, maxLines: 3),
                field(
                  'favouriteQuotation',
                  'Favourite quotation',
                  required: false,
                  maxLines: 3,
                ),
                FilledButton(
                  onPressed: save,
                  child: const Text('Save preview changes'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
