import 'package:flutter/material.dart';

import '../preview_member.dart';
import 'directory_screen.dart';
import 'my_profile_screen.dart';

class PreviewShell extends StatefulWidget {
  const PreviewShell({super.key});

  @override
  State<PreviewShell> createState() => _PreviewShellState();
}

class _PreviewShellState extends State<PreviewShell> {
  int _selectedIndex = 0;
  PreviewMember _myProfile = previewMembers.first;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_selectedIndex == 0 ? 'Member directory' : 'My profile'),
      ),
      body: Column(
        children: [
          MaterialBanner(
            content: const Text(
              'Interface preview · fictional profiles · changes stay on this device until you leave this screen',
            ),
            leading: const Icon(Icons.visibility_outlined),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Exit'),
              ),
            ],
          ),
          Expanded(
            child: IndexedStack(
              index: _selectedIndex,
              children: [
                const DirectoryScreen(),
                MyProfileScreen(
                  member: _myProfile,
                  onChanged: (member) => setState(() => _myProfile = member),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) =>
            setState(() => _selectedIndex = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Directory',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'My profile',
          ),
        ],
      ),
    );
  }
}
