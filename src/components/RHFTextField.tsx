import { TextField, type TextFieldProps } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';

type Props = Omit<TextFieldProps, 'name'> & {
  name: string;
};

export function RHFTextField({ name, ...rest }: Props) {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          fullWidth
          error={!!fieldState.error}
          helperText={fieldState.error?.message ?? rest.helperText}
          {...rest}
        />
      )}
    />
  );
}
